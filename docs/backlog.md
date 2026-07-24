# Sticker Collector — Implementation Backlog

Target repo path: `docs/backlog.md`

**The contract:** one task = one Claude Code session = one branch = one PR = one `/clear`. If a task doesn't fit a session, it was written wrong — split it and tell me.

**Reading the columns:**
- **Load** — the *only* files the agent should read before starting. This column is the whole token strategy. If the agent asks to read something else, it's a signal the task is scoped wrong.
- **Model** — `opus` for anything where a subtle error is expensive and invisible (money, dates, concurrency). `sonnet` for everything with a test or a screen to check it against. `haiku` for mechanical work.
- **Done when** — checkable without opinion.

Size key: **S** ≈ 20 min · **M** ≈ 45 min · **L** ≈ 90 min. If an L is dragging past two hours, stop and split it.

---

## Phase 0 — Foundation

> **Prerequisite:** complete `docs/cloudflare-setup.md` before `F-01`. It produces the account ID, D1 database IDs and API token that `F-02` and `F-08` need, and it contains a decision (R2 vs D1 image storage) that task `A-02` depends on.

Nothing here is visible to a user. All of it is what stops the next 40 tasks from going sideways.

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **F-01** | pnpm workspace, TS project references, Biome, Vitest, `.gitignore` (incl. `.dev.vars`, `design/`), root scripts (`dev`/`build`/`test`/`typecheck`/`lint`) | M | sonnet | `architecture.md` §3 | `pnpm typecheck && pnpm test && pnpm lint` all pass on an empty repo |
| **F-02** | Single Worker: Hono app, `ASSETS` fallthrough, `/api/health`, minimal Vite React app. **Validate `wrangler.jsonc` against the installed wrangler schema first.** | M | sonnet | `architecture.md` §0.1, §3 | `wrangler dev` serves the React app at `/` and JSON at `/api/health` |
| **F-02b** | Dependency baseline: pin Node (`.nvmrc` + `engines` + CI), pnpm, vitest + pool-workers, zod, biome, TypeScript (check Drizzle's supported range). Commit generated `worker-configuration.d.ts`. | M | sonnet | — | All four checks green on current majors; CI and local resolve the same Node and pnpm |
| **F-03a** | Drizzle tooling (`drizzle.config.ts`, `db:generate`) + schema for all **10** tables (8 from the data model + `mutation`, `auth_attempt`) + `0001_init.sql` with the **5** trigger statements, CHECK constraints and indexes hand-appended | L | **opus** | `prd/09-data-model.md`, `architecture.md` §4 | Migration applies locally **and** `scripts/verify-triggers.sh` shows every forbidden statement rejected — one per trigger, plus both CHECK constraints |
| **F-03b** | Wire `packages/api` onto `@cloudflare/vitest-pool-workers` (first use); fixtures; automated test per trigger and CHECK, converted from `verify-triggers.sh` | L | **opus** | F-03a output, `architecture.md` §4.1 | Every test attempts the forbidden write through the D1 binding and asserts rejection. No test asserts merely that app code lacks an update path |
| **F-04** | Seed script: one user, sample epic, 3 routines, 2 one-offs, one sealed 12-sticker album | S | haiku | `db/schema.ts` | `pnpm seed` produces a usable local DB |
| **F-05** | Auth: `/api/auth/salt`, `/api/auth/login`, client-side PBKDF2, HS256 JWT + `Set-Cookie`, `requireAuth` middleware, D1 rate limiter | L | **opus** | `prd/07-services.md`, `architecture.md` §0.2, §4.4 | Wrong passphrase → 401; 11th attempt → 429; valid token reaches a protected route; **server never receives the passphrase** |
| **F-06** | Idempotency middleware + the `spend()` conditional-insert helper + `balance()` | M | **opus** | `architecture.md` §4.2–4.4 | Same `Idempotency-Key` twice → one ledger row, identical response. Overspend → 402, zero rows written |
| **F-07** | `ci.yml` — pin `node-version` from `.nvmrc` and pnpm from `packageManager` (deferred from F-02b). **No production credentials:** apply migrations locally, never `--remote` | S | haiku | `architecture.md` §8, `.nvmrc` | Green on a PR; CI resolves the same Node and pnpm majors as local; workflow runs with zero Cloudflare secrets present |
| **F-08** | `deploy.yml` + first real deploy (uses the IDs from `docs/cloudflare-setup.md`). **Pin `node-version` here too.** | M | sonnet | `architecture.md` §7, §8, `.nvmrc` | Production URL returns healthy `/api/health` |

> After F-08 you have a deployed, authenticated, empty app with an unbreakable ledger. That is the correct moment to start building features.

---

## Phase 1 — Design system in code

See `04-DESIGN-SYSTEM-HANDOFF.md` for how the bundle gets here. **Do this before Phase 2**, so no feature screen ever hardcodes a colour.

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **D-01** | Import handoff bundle → `styles/tokens.css` + Tailwind `@theme`. Colour, type scale, spacing, radii, shadows, motion. Nothing else. | M | sonnet | `design/` bundle | Tokens render on a test page; zero literal hex values outside `tokens.css` |
| **D-02** | Primitives, batch 1: `Button`, `Input`, `Textarea`, `Chip`, `Checkbox`, `Badge` | M | sonnet | `design/`, `tokens.css` | Every variant × state renders on `/dev/ui` |
| **D-03** | Primitives, batch 2: `Sheet`, `Dialog`, `Toast`, `ProgressBar`, `Tabs`, `EmptyState`, `Skeleton` | M | sonnet | `design/`, `components/ui/` | ditto |
| **D-04** | App shell: tab bar, header, routing skeleton, iOS safe-area insets, responsive breakpoints (3/4/6 sticker cols, 2/3/4 album cols) | M | sonnet | `design/`, `prd/04-albums.md` §Geometry | Every tab navigable and empty; correct column counts at iPhone/iPad/desktop widths |
| **D-05** | `/dev/ui` kitchen-sink route + write `docs/design-system.md` inventory table | S | haiku | `components/ui/` | Inventory lists every component with props, states, tokens. **This file replaces the bundle for all later tasks.** |
| **D-06** | CI guard: fail the build on hardcoded hex/rgb/px-font outside `tokens.css` | S | haiku | `ci.yml` | A deliberately-added `#ff0000` fails CI |

---

## Phase 2 — The earning loop

Ship this whole phase before touching albums. At the end of it you can use the app daily and start banking real coins — which means you'll be dogfooding the spending loop instead of guessing at it.

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **T-01** | `shared/recurrence.ts`: weekday mask → occurrences in a window; status derivation; timezone-aware "today". **Pure functions, no DB.** | L | **opus** | `prd/02-tasks.md`, `architecture.md` §0.3 | Tests cover: Mon–Fri routine, Sat-only, start/end bounds, DST boundary, missed at day 1 and 7, archived at day 8, dated one-off never archives, **cannot complete before scheduled date** |
| **T-02** | `shared/schema.ts`: Zod for every task/epic/occurrence payload | S | sonnet | `prd/02-tasks.md`, `prd/03-epics.md` | Types importable by both api and web |
| **T-03** | API: tasks CRUD + soft delete + bulk duplicate/delete | M | sonnet | `prd/02-tasks.md`, `db/schema.ts` | Deleting a routine stops generation; past occurrences survive |
| **T-04** | API: `GET /api/occurrences?from&to` — lazy materialisation, LEFT JOIN stored rows | M | **opus** | T-01 output, `architecture.md` §0.3 | Querying next month writes **zero** rows to the database |
| **T-05** | API: complete / uncomplete an occurrence — writes row + reward snapshot + ledger, in one `batch()` | M | **opus** | `prd/01-coins.md`, `architecture.md` §4.2 | Reward edit doesn't change a closed occurrence's snapshot; late completion keeps `scheduled_on` but ledger carries the real timestamp |
| **T-06** | API: epics CRUD + delete-with-choice (cascade tasks vs unlink) | M | sonnet | `prd/03-epics.md` | Both delete modes behave; epic progress ratio excludes routines |
| **T-07** | API: `GET /api/wallet` (balance = SUM(ledger)) + paginated ledger | S | sonnet | `architecture.md` §4.1 | Balance is never read from a column |
| **T-08** | Web: home screen — Missed / Today / Backlog sections | L | sonnet | `prd/02-tasks.md` §Home, `design-system.md` | Three sections in spec order; priority tint + epic accent border both visible |
| **T-09** | Web: quick-add field | S | sonnet | `prd/02-tasks.md` §Enhancements | One field creates a one-off with default effort, no epic, no navigation |
| **T-10** | Web: full task form — effort presets (15/30/60/90), reward defaulting to effort, routine/one-off switch, weekday picker | M | sonnet | `prd/02-tasks.md` | Opened from an epic → epic pre-filled. Opened from main button → all blank |
| **T-11** | Web: complete interaction — coin animation, balance ticker, **undo window**, optimistic mutation | M | sonnet | `prd/02-tasks.md` §Enhancements, `design-system.md` | Undo inside the window writes nothing; after it, only re-opening the occurrence corrects it |
| **T-12** | Web: weekly grid — tasks as rows, 7 weekday columns, toggle cells | M | sonnet | `prd/02-tasks.md` §Weekly grid | Mon–Fri habit created in 5 taps; no form opened |
| **T-13** | Web: epics screen + epic detail + multi-select bulk actions | M | sonnet | `prd/03-epics.md` | CRUD works; add-task from epic pre-fills |

---

## Phase 3 — The spending loop

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **A-01** | `shared/economy.ts`: total album cost (coins + hours), expected value of a random pull, odds validation, **empty-tier redistribution**, duplicate refund | L | **opus** | `prd/04-albums.md` §Economy, `prd/05-stickers.md` §Random | Tests: odds sum to 100, monotonically decreasing, zero-odds tier permitted, redistribution is proportional, dupe sale is always a net loss under any user values |
| **A-02** | Image pipeline: canvas aspect-fill crop + drag-to-reposition, exact 591×827 / 1772×2480, JPEG q0.92, sha256 key, upload, `GET /api/images/:key` via cookie auth | L | **opus** | `prd/04-albums.md` §Geometry, `architecture.md` §5 | Re-uploading identical bytes creates no second R2 object; image loads in a plain `<img>` tag |
| **A-03** | API: create + seal album — sticker set, tier assignment, slot shuffle, all economics frozen. One `batch()`. **Sticker rows are insert-only** (the `sticker_frozen` trigger blocks all updates), so the full set must arrive in one POST; the wizard holds draft state client-side. | L | **opus** | `prd/04-albums.md` §Creating, §Sealing | Post-seal update attempt is rejected **by the trigger**, not by application code |
| **A-04** | API: unlock album / buy sticker directly / random pull / sell duplicate — all via `spend()` | L | **opus** | `prd/01-coins.md`, `prd/05-stickers.md`, `architecture.md` §4.3 | Buying inside a locked album → 403. Pull when no unowned sticker is reachable → 409. Insufficient balance → 402 with zero writes |
| **A-05** | API: album list with computed completion %, status filter, sort | M | sonnet | `prd/04-albums.md` | Completion % computed, never stored. `completed_at` set exactly once, on first hit of 100% |
| **A-06** | Web: album grid — locked B&W, unlocked colour, progress bar, "almost there" surfacing, affordability cue | M | sonnet | `prd/04-albums.md`, `design-system.md` | Grayscale is a CSS filter; no second image is ever stored |
| **A-07** | Web: album creation wizard (from scratch) — import, crop, tier assign, prices, odds with 60/25/12/3 default, **live economy preview**, seal confirmation. **Persist draft state to IndexedDB** — albums are sealed on create, so an unsent wizard holds the whole arrangement in browser state. | L | sonnet | `prd/04-albums.md` §Creating, A-01 output | Preview shows total cost in coins *and* hours, and EV beside the random price. Neither blocks sealing |
| **A-08** | Web: album detail — sticker grid, rarity frames on locked slots, duplicate quantity badge, missing-only toggle | M | sonnet | `prd/05-stickers.md` | Legendary slot identifiable while still locked |
| **A-09** | Web: the reveal — B&W floods to colour, held longer for higher tiers; inline "sell for X" on a duplicate | M | sonnet | `prd/05-stickers.md` §Enhancements | Duplicate ends in a choice, not a dead end |
| **A-10** | Web: create-from-existing (inherits images by key, no re-upload, no ownership carried) | M | sonnet | `prd/04-albums.md` §Creating from existing | New album arrives locked; every sticker locked; source album untouched; **zero bytes uploaded** |
| **A-11** | Web: delete album — warning + type-the-title confirmation (trimmed, case-insensitive) | S | sonnet | `prd/04-albums.md` §Deleting | Wrong title keeps the button disabled |

---

## Phase 4 — Print export

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **E-01** | `lib/pdf.ts` with `pdf-lib`: cover page, 3×3 sticker pages, rarity frames, 0.25 pt cut guides, footer, A4 + Letter | L | **opus** | `prd/06-export.md`, `architecture.md` §10 | Unit test asserts point-level positions on both paper sizes; images embedded without resampling |
| **E-02** | Export UI — gated on completion, re-runnable forever, filename `sticker-collector-{slug}-{yyyy-mm-dd}.pdf` | S | sonnet | `prd/06-export.md` | Incomplete album offers no export; complete one exports repeatedly |

---

## Phase 5 — Reports

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **R-01** | API aggregates: per-routine streak, longest streak, perfect days, completion rate (7/30/90), weekday shape | L | **opus** | `prd/08-reports.md` | An unscheduled day never breaks a streak; a scheduled miss does |
| **R-02** | API aggregates: minutes invested per week/month, effort by epic, stickers over time, albums completed | M | sonnet | `prd/08-reports.md` | All derived from the ledger and completion timestamps; no new tracking |
| **R-03** | Web: heatmap (year of cells, shaded by proportion completed) | M | sonnet | `prd/08-reports.md` | Gaps are visible at a glance |
| **R-04** | Web: reports screen assembling R-01/R-02/R-03 | M | sonnet | `design-system.md` | Nothing economic on screen — momentum only, per spec |

---

## Phase 6 — Hardening

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **H-01** | PWA manifest, icon set, iOS splash screens, `apple-touch-icon`, install prompt | M | sonnet | `architecture.md` §6 | Installs to iPhone home screen and launches standalone |
| **H-02** | Service worker: precache shell, `CacheFirst` images, `SWR` reads, update toast | M | sonnet | `architecture.md` §6 | App shell and previously-seen images load with the network off |
| **H-03** | Backup export + restore (JSON + images, zipped client-side with `fflate`) | L | **opus** | `prd/07-services.md`, `architecture.md` §9 | Export → wipe local DB → restore reproduces balance, albums, holdings, and images exactly |
| **H-04** | Backup nudge after album create/complete + last-export date in settings | S | haiku | `prd/07-services.md` | — |
| **H-05** | Error boundaries, empty states, loading skeletons across all screens | M | sonnet | `design-system.md` | No blank screen anywhere |
| **H-06** | Playwright smoke: (1) complete task → coins → unlock album → buy sticker; (2) complete album → export PDF | M | sonnet | — | Both run in CI |

---

## Phase 7 — After go-live

From the spec's own list, plus what I've deferred. Do not start these until Phase 6 ships.

`P-01` Strong sticker-purchase animation · `P-02` Strong album-purchase animation · `P-03` Strong album-completion animation · `P-04` Print/export preview · `P-05` Settings screen · `P-06` Onboarding · `P-07` **Offline outbox** (queue completions in IndexedDB, replay via existing idempotency keys) · `P-08` Web Push reminders (VAPID + one Cron Trigger; iOS requires installed PWA) · `P-09` Export spec doc as PDF

---

## Dependency spine

```
F-01 → F-02 → F-03 → F-05 → F-06 → F-08          (foundation, strictly serial)
                 ↓
D-01 → D-02/D-03 → D-04 → D-05                    (can run in parallel with F-05..F-08)
                 ↓
T-01 → T-04/T-05 → T-08 → T-11                    (earning loop; SHIP AND USE IT)
                 ↓
A-01 → A-02 → A-03 → A-04 → A-06/A-07/A-08        (spending loop)
                 ↓
E-01 → R-01 → H-01 → H-06                          (reward, reflection, polish)
```

The only hard rule in that graph: **T-01 and A-01 come before anything that consumes them.** They're pure functions with full test coverage, they're cheap to get right, and every screen downstream depends on them being correct. Get an `opus` session on each, review the tests yourself, and the rest of the build is mostly typing.

---

## Progress

Keep this table updated — it is the first thing a new session reads, and it costs almost nothing in tokens.

| Phase | Done | Total | Status |
|---|---|---|---|
| 0 Foundation | 9 | 10 | in progress (F-08 workflow written; first deploy pending runbook) |
| 1 Design system | 0 | 6 | not started |
| 2 Earning loop | 0 | 13 | not started |
| 3 Spending loop | 0 | 11 | not started |
| 4 Export | 0 | 2 | not started |
| 5 Reports | 0 | 4 | not started |
| 6 Hardening | 0 | 6 | not started |
| **MVP total** | **9** | **52** | |
