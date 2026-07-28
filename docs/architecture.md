# Sticker Collector — Implementation Architecture

Companion to the business-rules document. That document defines *what*. This one defines *where it runs, how it ships, and which invariants are enforced by machinery rather than by discipline*.

Target repo path: `docs/architecture.md`

---

## 0. Three corrections to the spec

These are not preferences. Each one is a thing that will fail — silently or loudly — if built exactly as written.

### 0.1 One Worker, not Pages + Workers

The spec proposes Cloudflare Pages for static hosting and Cloudflare Workers for the API. Use **a single Worker with Static Assets** instead.

Cloudflare's own pricing page confirms the economics are unchanged: <cite index="27-1">requests to static assets are free and unlimited</cite>. So you lose nothing, and you gain:

- **One deploy, one domain, one `wrangler.jsonc`.** Not two deploy pipelines that can drift.
- **No CORS.** The API and the app are same-origin. This deletes an entire category of bug and an entire category of agent-written middleware.
- **Cookies work.** Critical for image serving — see §5.
- One less thing for the agent to hold in context.

### 0.2 The passphrase KDF cannot run on the server

The spec says PBKDF2-SHA256 at 600,000 iterations, verified server-side. **This will fail on the free plan.** Cloudflare's limits table is explicit: Workers Free allows <cite index="26-1">10 ms of CPU time per invocation</cite>, and <cite index="26-1">CPU time measures how long the CPU spends executing your Worker code</cite> — WebCrypto work counts. 600k PBKDF2 iterations is on the order of 100–300 ms. Every login would return `exceededCpu`.

**Fix — move the stretching to the client, keep the verification on the server:**

```
1. GET  /api/auth/salt          → { salt, iterations }   (salt is not secret)
2. client: PBKDF2-SHA256(passphrase, salt, 600_000) → 32 bytes → authKey
3. POST /api/auth/login { authKey }
4. worker: sha256(authKey), constant-time compare vs user.auth_key_hash   (~microseconds)
5. worker: issue HS256 JWT, exp 90d  →  returned in body AND set as
           Set-Cookie: sc_session=…; HttpOnly; Secure; SameSite=Strict; Path=/
```

The browser has no CPU limit, so you keep the full 600k iterations — the security property the spec wanted. The server never sees the passphrase at all, which is *stronger* than the original design. Rate-limiting stays server-side (§4.4).

**Schema change this implies:** `user.passphrase_hash` becomes `user.auth_key_hash`, plus `user.kdf_salt` and `user.kdf_iterations` so the parameters can be raised later without a rewrite.

### 0.3 `missed` and `archived` are derived, not written

The spec says an occurrence becomes `missed` at end of day and `archived` after seven. If those are *written* states you need a scheduled job that runs at midnight **in the user's timezone** and touches rows that, by the spec's own lazy-materialisation rule, do not exist yet.

Don't. **Persist only what a human did.** A row exists in `occurrence` only when it is completed (or explicitly archived by hand). Everything else is computed at read time:

```
no row + scheduled_on  > today          → pending (future)
no row + scheduled_on == today          → pending
no row + today - scheduled_on ∈ [1,7]   → missed
no row + today - scheduled_on  > 7      → archived   (routines only)
no row + one-off, dated, past           → missed     (never archives, per spec)
row.status = done                       → done
```

`today` is resolved server-side from `user.timezone` via `Intl.DateTimeFormat` (available in Workers). This deletes the cron job, deletes the midnight race condition, deletes the "user flew to Lisbon" bug class, and makes the whole recurrence engine a pure function you can unit-test without a database. Cron Triggers are then needed only for push reminders, which are post-MVP.

---

## 1. Decisions at a glance

| Concern | Choice | Why |
|---|---|---|
| Hosting + API | **One Cloudflare Worker + Static Assets** | §0.1 |
| API framework | **Hono** | ~14 kB, first-class Workers support, typed context, tiny surface for the agent to learn |
| Database | **Cloudflare D1** | Per spec |
| DB access | **Drizzle ORM** + `drizzle-kit` | Typed queries; schema is TS, so types flow to the client for free. Big token saver — the agent infers instead of re-reading SQL. **Adopted for queries in T-03**; `routes/auth.ts` and `lib/rate-limit.ts` predate it and stay on raw D1 statements, and `spend()` stays raw permanently — its balance guard lives inside the SQL `WHERE` (§4.3) and must remain legible. Use `db(c.env)` from `db/client.ts` |
| Migrations | **`wrangler d1 migrations`** (plain SQL files) | Drizzle generates them; wrangler applies them. Reviewable diffs |
| Object storage | **Cloudflare R2**, content-addressed keys | Per spec; dedupe comes free (§5) |
| Frontend | **React 19 + TypeScript + Vite** | Design handoff bundles target React; Vite's build is what `assets.directory` points at |
| Routing | **`react-router`** (added in D-04) | Five tabs, plus album detail (A-08) and the wizard (A-07) as nested routes. The Zustand line below only holds because the URL holds the rest — that needs a real router, not 40 lines of `pushState`. `not_found_handling: single-page-application` in `wrangler.jsonc` is what makes deep links work in production |
| Styling | **Tailwind v4** with `@theme` tokens from the design system | CSS-first tokens map 1:1 to a design-system export |
| Server state | **TanStack Query** (added in T-08) | Cache + optimistic mutations + retry, which is exactly the undo/offline story |
| Client state | **Zustand** (one small store) | Only for UI state the URL can't hold |
| Forms | **react-hook-form + Zod** | Same Zod schemas as the API. One source of truth for validation |
| PWA | **`vite-plugin-pwa`** (Workbox) | Manifest + service worker + update flow |
| PDF | **`pdf-lib`** | Embeds JPEG at native resolution, exact point-level layout control |
| Lint/format | **Biome** | One tool, one config file. Replaces ESLint + Prettier — three fewer files in the agent's context |
| Unit tests | **Vitest** | Same config as Vite |
| Worker tests | **`@cloudflare/vitest-pool-workers`** | Runs tests *inside* workerd with real D1/R2 bindings |
| E2E | **Playwright**, two smoke specs only | Guards the two loops; more than that is maintenance you won't do |
| Package manager | **pnpm workspaces** | Fast, strict, good monorepo ergonomics |
| CI/CD | **GitHub Actions + `wrangler-action`** | §8 |
| Errors/logs | **Workers Logs** (`observability.enabled`) | Built in, free tier, no third party |

---

## 2. Topology

```
                    ┌──────────────────────────────────────────┐
   iPhone / iPad /  │        ONE Cloudflare Worker             │
   desktop browser  │                                          │
        │           │  fetch()                                 │
        │  HTTPS    │    ├─ /api/*   → Hono router  ──┬── D1   │  tasks, occurrences,
        └──────────►│    │                            │        │  ledger, albums,
                    │    │                            └── R2   │  stickers, holdings
     installed PWA  │    │                                     │
     (home screen)  │    └─ /*       → ASSETS binding          │  images (private)
                    │                  (Vite build, free)      │
                    └──────────────────────────────────────────┘
                                       ▲
                                       │  wrangler deploy
                    GitHub Actions ────┘  wrangler d1 migrations apply
```

Everything the browser does offline is Workbox cache. The server is the source of truth, as the spec requires.

---

## 3. Repository

**One repo, one PR per backlog task.** Monorepo via pnpm workspaces — not for scale, but because clean package boundaries let a Claude Code session load one package and ignore the rest.

```
sticker-collector/
├── CLAUDE.md                      ← always-on agent context. Keep under 100 lines.
├── AGENTS.md                      ← symlink to CLAUDE.md (cross-tool standard)
├── wrangler.jsonc                 ← the ONE worker
├── pnpm-workspace.yaml
├── biome.json
├── tsconfig.base.json
│
├── .claude/
│   ├── commands/                  ← /task, /ship, /ds  (see workflow doc)
│   ├── agents/                    ← explore, test-runner, reviewer
│   └── settings.json              ← hooks + permissions
│
├── .github/workflows/
│   ├── ci.yml                     ← PR: typecheck, lint, test, build, dry-run deploy
│   └── deploy.yml                 ← main: migrate then deploy
│
├── docs/
│   ├── prd/                       ← the business-rules doc, SPLIT (see workflow doc §2)
│   │   ├── 00-flow.md   01-coins.md   02-tasks.md   03-epics.md
│   │   ├── 04-albums.md 05-stickers.md 06-export.md 07-services.md
│   │   └── 08-reports.md 09-data-model.md
│   ├── architecture.md            ← this file
│   ├── backlog.md
│   ├── design-system.md           ← component inventory. The agent's cheap index.
│   └── adr/                       ← one short file per irreversible decision
│
├── design/                        ← Claude Design handoff bundle lands here
│
└── packages/
    ├── shared/                    ← THE VALUABLE PACKAGE. Zero dependencies.
    │   └── src/
    │       ├── schema.ts          ← Zod: every request/response body
    │       ├── recurrence.ts      ← weekday mask → occurrences, status derivation
    │       ├── economy.ts         ← total cost, EV, odds redistribution, dupe refund
    │       └── *.test.ts          ← where most of your tests live
    │
    ├── api/
    │   ├── src/
    │   │   ├── index.ts           ← worker entry: Hono app + ASSETS fallthrough
    │   │   ├── routes/            ← one file per resource, < 200 lines each
    │   │   ├── db/schema.ts       ← Drizzle table definitions
    │   │   └── middleware/        ← auth, rate-limit, idempotency, error
    │   └── migrations/            ← 0001_init.sql, 0002_….sql
    │
    └── web/
        ├── src/
        │   ├── routes/            ← one file per screen
        │   ├── components/ui/     ← design-system primitives (generated, then frozen)
        │   ├── components/        ← feature components
        │   ├── lib/pdf.ts         ← the print export
        │   ├── lib/image.ts       ← crop + hash + upload
        │   └── styles/tokens.css  ← from the design system. Never hand-edited.
        └── dist/                  ← what wrangler serves
```

**`packages/shared` is the architectural centre of gravity.** Every rule in the spec that could be violated by careless code lives there as a pure function with tests, and both the Worker and the browser import it. An agent that changes `economy.ts` gets caught by a test in the same session, not by you in production three weeks later.

### wrangler.jsonc (skeleton)

```jsonc
{
  "name": "sticker-collector",
  "main": "packages/api/src/index.ts",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./packages/web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "sticker-collector",
    "database_id": "<from wrangler d1 create>",
    "migrations_dir": "packages/api/migrations"
  }],
  "r2_buckets": [{ "binding": "IMAGES", "bucket_name": "sticker-collector-images" }],
  "observability": { "enabled": true },
  "env": {
    "preview": {
      "d1_databases": [{ "binding": "DB", "database_name": "sticker-collector-preview", "database_id": "…" }],
      "r2_buckets": [{ "binding": "IMAGES", "bucket_name": "sticker-collector-images-preview" }]
    }
  }
}
```

> **Pin wrangler to latest, not to a remembered version.** Field names in the `assets` block have moved between wrangler releases, so this skeleton must be validated against the installed schema — but validate against a *current* install. Run `pnpm add -D wrangler@latest -w`, confirm with `npx wrangler --version`, and only then check the config. An agent asked to "match the installed version" will happily work around limitations that were fixed a year ago.
>
> **`run_worker_first` must stay an array.** The boolean `true` unconditionally invokes the Worker on every request, which turns free static-asset requests into counted Worker requests and — on the free tier — returns 429 instead of falling back to asset serving when limits are hit. The whole app goes dark rather than degrading. The array form `["/api/*"]` keeps assets on the free path and keeps bot traffic probing for `.env` away from your Worker entirely. If the array form fails to validate, the wrangler version is too old; upgrade it rather than downgrading the config.

---

## 4. Data layer

### 4.1 Put the invariants in the database

The spec names three invariants. In an agentic build, "the code must not do X" is worth very little — the code gets rewritten by a machine forty times. Encode them as **SQLite triggers in `0001_init.sql`**, where no amount of generated application code can route around them:

```sql
-- INVARIANT 1: the ledger is append-only. The wallet is its sum, never a column.
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

-- INVARIANT 2: a sealed album's economics never change. Editions are new rows.
CREATE TRIGGER album_sealed_frozen BEFORE UPDATE ON album
WHEN old.sealed_at IS NOT NULL AND (
     new.unlock_price   <> old.unlock_price
  OR new.random_price   <> old.random_price
  OR new.price_common   <> old.price_common   OR new.odds_common   <> old.odds_common
  OR new.price_rare     <> old.price_rare     OR new.odds_rare     <> old.odds_rare
  OR new.price_epic     <> old.price_epic     OR new.odds_epic     <> old.odds_epic
  OR new.price_legendary<> old.price_legendary OR new.odds_legendary<> old.odds_legendary)
BEGIN SELECT RAISE(ABORT, 'sealed album economics are immutable'); END;

-- INVARIANT 3: a coin snapshot is written once, at completion, never recomputed.
CREATE TRIGGER occurrence_snapshot_write_once BEFORE UPDATE ON occurrence
WHEN old.reward_snapshot_coins IS NOT NULL
 AND new.reward_snapshot_coins IS NOT old.reward_snapshot_coins
BEGIN SELECT RAISE(ABORT, 'coin snapshot is write-once'); END;

-- stickers are immutable after seal
CREATE TRIGGER sticker_frozen BEFORE UPDATE ON sticker
BEGIN SELECT RAISE(ABORT, 'sticker rows are immutable'); END;
```

Add `CHECK (odds_common + odds_rare + odds_epic + odds_legendary = 100)` and `CHECK (quantity >= 1)` while you're there — **and make every column they reference `NOT NULL`.** SQLite rejects a CHECK only when it evaluates to `FALSE`; `NULL = 100` evaluates to `NULL`, which passes. Without `NOT NULL`, both constraints are decorative.

**Triggers live in their own migration.** `0001_init.sql` is generated and owned by drizzle-kit; the triggers go in a hand-written `0002_triggers.sql` that drizzle never touches. Appending them to the generated file means any future `db:generate` silently wipes every invariant, in a diff that looks like routine schema work.

### 4.2 D1 has no interactive transactions

**This is the single most important thing your agent needs to know about D1.** There is no `BEGIN … COMMIT` you can hold open across `await`s. Atomicity comes from `db.batch([...])`, which runs an array of statements in one implicit transaction.

Every multi-statement mutation must be expressed as one batch. Drizzle supports `db.batch()` on the D1 driver.

### 4.3 Spending is a conditional insert

You cannot read the balance, check it in JS, and then write — another request could interleave, and there's no transaction to protect you. Express the check *inside* the insert:

```sql
INSERT INTO ledger (id, user_id, amount_coins, reason, album_id, created_at)
SELECT ?1, ?2, ?3, ?4, ?5, ?6
WHERE (SELECT COALESCE(SUM(amount_coins), 0) FROM ledger WHERE user_id = ?2) >= ABS(?3);
```

Then inspect `meta.changes`. `0` means insufficient funds — return `402`. `1` means the coins are spent, atomically. Every spend path (album unlock, direct sticker buy, random pull) uses this shape. Put it in one helper, `spend()`, and never write it twice.

**The random pull, in full:**

```
1. Worker rolls tier by odds (excluding empty tiers, redistributing proportionally
   — pure function from packages/shared/economy.ts)
2. Worker picks a sticker uniformly within that tier (owned or not, per spec)
3. db.batch([
     conditional-insert ledger row (random_pull, -random_price),
     INSERT INTO holding … ON CONFLICT(sticker_id) DO UPDATE SET quantity = quantity + 1
   ])
4. If the ledger insert changed 0 rows, the batch is rolled back and nothing happened.
```

Selling a duplicate never edits the pull; it appends a `duplicate_sale` row, per spec.

### 4.4 Idempotency and rate limiting

Both need one small table each and both pay for themselves immediately.

```sql
mutation(key TEXT PRIMARY KEY, response_json TEXT, created_at TEXT);
auth_attempt(ip_hash TEXT, window_start INTEGER, count INTEGER, PRIMARY KEY(ip_hash, window_start));
```

Every mutating endpoint accepts an `Idempotency-Key` header. Middleware does `INSERT OR IGNORE` first; if `changes === 0`, replay the stored response. **Build this in Phase 0, before any mutation exists.** It costs an hour now, and it is what makes the offline outbox (§6) a small feature later instead of a rewrite. It also means a flaky tap on "complete" during a subway ride never mints coins twice.

Auth rate limit: 10 attempts per 15-minute window per hashed IP.

### 4.5 Schema deltas from the spec

| Table | Change | Reason |
|---|---|---|
| `user` | `passphrase_hash` → `auth_key_hash`, add `kdf_salt`, `kdf_iterations` | §0.2 |
| `occurrence` | rows exist only for `done`/explicitly-archived | §0.3 |
| `album` | add `edition_number INTEGER DEFAULT 1` | makes the edition chain readable without recursion |
| new | `mutation`, `auth_attempt` | §4.4 |
| indexes | `ledger(user_id, created_at)`, `occurrence(task_id, scheduled_on)`, `holding(sticker_id)`, `task(user_id, type, deleted_at)` | the reports and home screen queries |

---

## 5. Images

Client-side crop, content-addressed storage, private serving.

```
import → <canvas> aspect-fill crop + drag-to-reposition
       → toBlob('image/jpeg', 0.92) at EXACTLY 591×827 or 1772×2480
       → sha256(bytes) → key = "img/<hex>.jpg"
       → PUT /api/images/<key>   (skip if HEAD says it exists)
       → store key in sticker.image_key / album.cover_key
```

**Store JPEG, not WebP.** `pdf-lib` embeds JPEG and PNG only. If the masters are WebP, every print export has to re-encode 60+ images in the browser first — slow, lossy twice, and a battery drain on an iPad. This decision is expensive to reverse once a user has albums, so make it now.

**Content-addressing pays for "create from an existing album" directly.** The new album's stickers reference the same keys. Zero bytes copied, zero uploads, and the source album is untouched exactly as the spec requires. It also makes the `Cache-Control: private, max-age=31536000, immutable` header honest — the bytes at a key can never change.

**Serving is where the single-Worker decision earns its keep.** `<img src="/api/images/…">` cannot send an `Authorization` header. Because the app and the API are the same origin, the session cookie from §0.2 is sent automatically. `GET /api/images/*` authenticates by cookie; the JSON API authenticates by bearer token. No signed URLs, no public bucket, no token-in-querystring leaking into logs.

Grayscale is never stored (per spec) — `filter: grayscale(1)` in CSS, and the reveal animation is a transition on that filter.

---

## 6. Offline

Honest scope for v1: **read-anywhere, write-online.**

- Workbox precaches the app shell. Opening the PWA on the Tube shows today's list.
- `/api/images/*` → `CacheFirst` (safe: content-addressed).
- `GET /api/*` → `StaleWhileRevalidate`, so the last-seen state renders instantly.
- Mutations → network only, with TanStack Query optimistic updates and retry.

The offline **outbox** — queuing completions in IndexedDB and replaying them on reconnect — is a genuinely valuable feature for a habit app, and it is deliberately v1.1. Because §4.4 gives every mutation an idempotency key from day one, adding it later is a queue and a replay loop, not a redesign.

Register the service worker with `registerType: 'prompt'` and show an update toast. Auto-updating a PWA mid-interaction is how you lose an in-progress album form.

---

## 7. Environments

| | Local | Preview | Production |
|---|---|---|---|
| Run | `wrangler dev` (workerd, local D1/R2) | Worker version preview URL | Worker |
| D1 | local SQLite file | `sticker-collector-preview` | `sticker-collector` |
| R2 | local FS | `…-images-preview` | `…-images` |
| Secrets | `.dev.vars` (gitignored) | `wrangler secret --env preview` | `wrangler secret` |

Worker secrets: `TOKEN_SIGNING_KEY` (32 random bytes, base64), later `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`.
GitHub secrets: `CLOUDFLARE_API_TOKEN` (scoped: Workers Scripts Edit, D1 Edit, R2 Edit), `CLOUDFLARE_ACCOUNT_ID`.

`.dev.vars` and `design/` assets must be in `.gitignore` from commit one. An agent that can read a real token will eventually paste one into a log line.

---

## 8. CI/CD

**`ci.yml`** — on pull request:

```
setup pnpm + node 22 (cache)
pnpm install --frozen-lockfile
pnpm biome ci .
pnpm typecheck            # tsc -b, all packages
pnpm test                 # vitest: shared + api (workers pool)
pnpm --filter web build
npx wrangler deploy --dry-run
npx wrangler d1 migrations apply sticker-collector --local    # every migration, from scratch
```

**PR CI must not need production credentials.** No `--remote` calls, no `CLOUDFLARE_API_TOKEN`. Applying migrations to a local D1 from scratch proves more than listing remote ones does — it catches syntax errors, a wiped `0002_triggers.sql`, and schema drift, and the trigger tests then run against that database. Keep the Cloudflare secrets scoped to `deploy.yml`, which runs on `main` after review. A workflow that reaches into production on every PR can't be run offline, can't be debugged without secrets, and tells you less than `git diff` on `migrations/`.

**`deploy.yml`** — on push to `main`:

```
[ci steps]
npx wrangler d1 migrations apply sticker-collector --remote
npx wrangler deploy
curl -f https://<host>/api/health
```

Migrations run **before** deploy, which means every migration must be backward-compatible with the currently-live Worker for the few seconds between the two steps. For a single-user app this is nearly free — just never do a destructive rename in one step. Expand, deploy, contract.

**Use `npx wrangler`, not `cloudflare/wrangler-action`.** The action installs its own wrangler, so pinning it means the version lives in two places and one of them eventually goes stale. `npx wrangler` resolves from the lockfile — same version locally, in CI, and in deploy. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as `env` on the individual steps that need them rather than job-wide.

Turn on branch protection requiring `ci` to pass, even though you're solo — the agent will be opening the PRs, and this is the gate that catches it.

**The first deploy is run by hand, then proven by the workflow.** Order matters, because the Worker must exist before it can hold a secret:

```bash
npx wrangler d1 migrations apply sticker-collector --remote
npx wrangler deploy
npx wrangler secret put TOKEN_SIGNING_KEY
curl -f https://<host>/api/health
```

Then merge a trivial change so `deploy.yml` runs on its own and proves itself on a commit whose blast radius is nothing.

**Never run `verify-triggers.sh` against production.** It seeds ledger rows, the ledger is append-only by trigger, and the wallet is `SUM(ledger)` — the fixtures would corrupt the balance permanently and the invariant under test would block cleanup. Use the preview database.

**Migration discipline:** Drizzle generates the SQL, you read the diff, wrangler applies it. Never let an agent hand-write a migration that a `drizzle-kit generate` could have produced, and never let it edit a migration that has already been applied.

---

## 9. Observability, backup, health

- `observability.enabled = true` in wrangler config → Workers Logs, free tier, queryable in the dashboard. `npx wrangler tail` for live debugging.
- `GET /api/health` → checks D1 (`SELECT 1`) and R2 (`head` a sentinel key), returns `{ ok, version, migrations }`. The deploy pipeline curls it.
- A React error boundary POSTs to `/api/client-error` (rate-limited, no PII).
- **Backup is a feature, not a menu item** (spec §Services). `GET /api/backup/manifest` returns every table as JSON plus the list of image keys; the client fetches the images and zips everything with `fflate` in a web worker. The images are irreplaceable — the spec says originals are discarded on import — so a data-only backup is not a backup. Restore is the same flow reversed, gated behind typing the word `RESTORE`.
- Prompt for a backup after any album is created or completed, and show the last-export date in settings.

---

## 10. Print export geometry

Worth stating once, precisely, so the agent doesn't rediscover it: `1 mm = 2.834645669 pt`.

| | mm | pt |
|---|---|---|
| A4 page | 210 × 297 | 595.28 × 841.89 |
| Letter page | 215.9 × 279.4 | 612 × 792 |
| Sticker | 50 × 70 | 141.73 × 198.43 |
| Cover | 150 × 210 | 425.20 × 595.28 |
| Gutter | 12 | 34.02 |

A 3×3 grid is `3×50 + 2×12 = 174 mm` wide and `3×70 + 2×12 = 234 mm` tall. On A4 that leaves 18 mm side margins and 31.5 mm top/bottom (footer lives there). On Letter, 20.95 mm and 22.7 mm. Both fit without scaling — so the export never resamples, and 300 dpi is preserved as the spec requires.

---

## 11. Cost check

| Service | Free allowance | Realistic single-user load |
|---|---|---|
| Worker requests | 100k/day | < 500/day |
| Worker CPU | 10 ms/invocation | ~2–4 ms; the KDF is on the client (§0.2) |
| Static assets | free, unlimited | — |
| D1 | 5 GB, generous daily rows | kilobytes |
| R2 | 10 GB, no egress fees | ~9 MB per 60-sticker album → ~1,000 albums |
| Cron triggers | 5 per account | 0 in MVP, 1 later for push |

Nothing here approaches a paid tier. The one CPU-limit risk was the KDF, and §0.2 removes it.

---

## 12. Open decisions — I need your call

1. ~~**R2 vs D1 BLOBs.**~~ **RESOLVED: R2.** A payment method is on file; the account stays on **Workers Free**, so expected spend is $0.00/month. This is the one place the spec's "no card" constraint is knowingly relaxed. Task `A-02` still builds the `ImageStore` interface — see `docs/cloudflare-setup.md` §5 — because it makes the upload path unit-testable without hitting R2, not because the decision is in doubt.
2. **JPEG masters (recommended) vs WebP.** Decide before task `A-02`; it is expensive afterwards.
3. **Offline completions in v1, or v1.1?** I've scoped v1.1. If you check tasks on the move with no signal, say so and I'll pull it forward.
4. **Push reminders in MVP?** The spec lists Web Push in the stack table but never specifies a reminder feature. I've put it in Phase 7. iOS requires the PWA be installed and permission granted by user gesture.
5. **Custom domain, or `*.workers.dev`?** Affects nothing but the cookie `Domain` and your muscle memory.
6. Your requirements list ends mid-sentence: *"The agent must get the context when …"*. I've assumed you mean **the agent should pull context on demand rather than carry it always**, and designed the doc split and `/task` command around that. Confirm or correct.
