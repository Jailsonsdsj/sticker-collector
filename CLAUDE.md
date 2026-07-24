# Sticker Collector

A single-user PWA to-do list where completing tasks earns coins, and coins buy self-authored albums and stickers. Completing an album unlocks a print-ready PDF.

## Stack

One Cloudflare Worker serves both the API (Hono) and the static assets (Vite build).
D1 + Drizzle · R2 for images · React 19 + TS + Tailwind v4 · pnpm workspaces · Biome · Vitest.

- `packages/shared` — Zod schemas + pure business logic (economy, recurrence). **No dependencies.**
- `packages/api` — Worker entry, routes, Drizzle schema, migrations.
- `packages/web` — React PWA.

## Where things are written down

Read these **on demand**, never by default:

| Need | File |
|---|---|
| The task I'm working on | `docs/backlog.md` (find the row, load only its `Load` column) |
| Feature rules | `docs/prd/0X-*.md` — one file per feature |
| Infrastructure, invariants, deploy | `docs/architecture.md` |
| UI components, props, tokens | `docs/design-system.md` |

Do not read the whole `docs/prd/` directory. Load the one section the task names.

## Rules that are not inferable from the code

**D1 has no interactive transactions.** Multi-statement mutations go in one `db.batch([...])`. There is no `BEGIN`/`COMMIT`.

**Spending is a conditional insert, never read-then-write.** Use the `spend()` helper: the balance check lives inside the SQL `WHERE`, and `meta.changes === 0` means insufficient funds → `402`. See `docs/architecture.md` §4.3.

**The wallet balance is `SUM(ledger)`.** It is never a column, never cached, never denormalised.

**The ledger is append-only** and enforced by a database trigger. So are: sealed album economics, occurrence coin snapshots, and sticker rows. If a write fails with `RAISE(ABORT)`, the code is wrong — do not remove the trigger.

**`missed` and `archived` are derived, not stored.** An `occurrence` row exists only when completed or explicitly archived. Everything else is computed at read time from the weekday mask + the user's timezone. Never write future occurrences.

**Coin snapshots are frozen at completion.** Editing a task's reward affects future occurrences only. History is never rewritten.

**Grayscale is a CSS filter.** One colour master per image. Never store or generate a second grayscale asset.

**Images are content-addressed:** key = `img/<sha256>.jpg`. Cropping happens client-side on canvas at exactly 591×827 (sticker) or 1772×2480 (cover). Store **JPEG**, not WebP — `pdf-lib` cannot embed WebP.

**Free-tier CPU limit is 10 ms per Worker invocation.** No heavy crypto or image processing server-side. The passphrase KDF runs in the browser.

**TypeScript stays on 5.x.** TS 7 is a from-scratch native compiler and Drizzle's query-builder inference has not been validated against it. Do not bump the major without checking Drizzle's declared support first and saying so explicitly.

**Never pin a dependency version from memory.** Resolve `@latest` at install time and let the lockfile pin it. If a config or API "doesn't validate on this version", check whether the installed version is current *before* working around it — a stale pin produces limitations that no longer exist. Report any version more than one minor behind rather than coding around it.

**`assets.run_worker_first` is `["/api/*"]`, never `true`.** The boolean form bills every static asset as a Worker request and returns 429 instead of serving assets when free-tier limits are hit.

**Every mutating endpoint accepts `Idempotency-Key`.** Middleware handles it; don't reimplement per route.

## Conventions

- Colours, spacing, and type come from `styles/tokens.css` only. Literal hex or px values fail CI.
- Validation is Zod in `packages/shared`, imported by both the Worker and the browser. One schema, two consumers.
- Route files under 200 lines, one resource each. Components under 150.
- Prefer editing a named function over rewriting a file.
- Money is integer coins. No floats anywhere in the economy.
- Times are UTC ISO-8601; the local day is resolved from `user.timezone`.

## Commands

```
pnpm dev          # wrangler dev — worker + assets on :8787
pnpm test         # vitest: shared + api (workers pool)
pnpm typecheck    # tsc -b
pnpm lint         # biome ci .
pnpm seed         # reset local D1 with sample data
pnpm db:generate  # drizzle-kit → new migration in packages/api/migrations
```

Never hand-write a migration that `db:generate` could produce. Never edit an applied migration.

## Workflow

One backlog task per session. Start with `/task <ID>`. Plan before writing if more than three files are involved. Update the progress table in `docs/backlog.md` before finishing.
