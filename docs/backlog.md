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
| **D-01** | Import handoff bundle → `styles/tokens.css` + Tailwind `@theme`. Colour, type scale, spacing, radii, shadows, motion. Nothing else. | M | sonnet | `docs/design/` bundle | ✅ Tokens render on a test page; zero literal hex values outside `tokens.css` |
| **D-02** | Primitives, batch 1: `Button`, `Input`, `Textarea`, `Chip`, `Checkbox`, `Badge` | M | sonnet | `docs/design/`, `tokens.css` | ✅ Every variant × state renders on `/dev/ui` |
| **D-03** | Primitives, batch 2: `Sheet`, `Dialog`, `Toast`, `ProgressBar`, `Tabs`, `EmptyState`, `Skeleton` | M | sonnet | `docs/design/`, `components/ui/` | ✅ ditto |
| **D-04** | App shell: tab bar, header, routing skeleton, iOS safe-area insets, responsive breakpoints (3/4/6 sticker cols, 2/3/4 album cols) | M | sonnet | `docs/design/`, `prd/04-albums.md` §Geometry | ✅ Every tab navigable and empty; correct column counts at iPhone/iPad/desktop widths |
| **D-05** | `/dev/ui` kitchen-sink route + write `docs/design-system.md` inventory table | S | haiku | `components/ui/` | ✅ Inventory lists every component with props, states, tokens. **This file replaces the bundle for all later tasks.** |
| **D-06** | CI guard: wire `scripts/check-tokens.sh` (written in D-01) into `ci.yml` | S | haiku | `ci.yml`, `scripts/check-tokens.sh` | ✅ A deliberately-added `#ff0000` fails CI. `--self-test` runs first, so a broken guard fails loudly instead of passing silently |

---

## Phase 2 — The earning loop

Ship this whole phase before touching albums. At the end of it you can use the app daily and start banking real coins — which means you'll be dogfooding the spending loop instead of guessing at it.

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **T-01** | `shared/recurrence.ts`: weekday mask → occurrences in a window; status derivation; timezone-aware "today". **Pure functions, no DB.** | L | **opus** | `prd/02-tasks.md`, `architecture.md` §0.3 | ✅ All cases covered (37 tests). **Bit 0 of `weekdays` is Monday** (ISO, matching the weekly grid). Days are civil-date strings, never `Date` arithmetic — that is what makes DST a non-event |
| **T-02** | `shared/schema.ts`: Zod for every task/epic/occurrence payload | S | sonnet | `prd/02-tasks.md`, `prd/03-epics.md` | ✅ Types import from both api and web (verified). Request schemas are **strict**. An occurrence is addressed by `(taskId, scheduledOn)`, never by id — the row usually does not exist yet. `epic.accent` is a token name, not a colour |
| **T-03** | API: tasks CRUD + soft delete + bulk duplicate/delete | M | sonnet | `prd/02-tasks.md`, `db/schema.ts` | ✅ Deleting a routine stops generation (`liveTasks` predicate, which T-04 must use); past occurrences and their ledger rows survive. **Drizzle from here on** — `spend()` and auth stay raw SQL |
| **T-04** | API: `GET /api/occurrences?from&to` — lazy materialisation, LEFT JOIN stored rows | M | **opus** | T-01 output, `architecture.md` §0.3 | ✅ Zero rows written (asserted by row counts before/after). `materialiseWindow` is pure — no DB handle, so it *cannot* write. Window capped at 366 days for the 10 ms CPU budget. Deleted tasks contribute nothing, including stored rows |
| **T-05** | API: complete / uncomplete an occurrence — writes row + reward snapshot + ledger, in one `batch()` | M | **opus** | `prd/01-coins.md`, `architecture.md` §4.2 | ✅ Both criteria tested. **Uncomplete appends a negative `task_reward`** — the ledger is append-only, so a reversal is a row, never a deletion. The occurrence row survives at `pending` with its snapshot intact, so **re-completion pays the frozen amount**, not today's reward. `scheduledOn` is validated against the schedule or a client could mint coins for any date |
| **T-06** | API: epics CRUD + delete-with-choice (cascade tasks vs unlink) | M | sonnet | `prd/03-epics.md` | ✅ Both modes tested; ratio counts one-offs only. Mode is a **query param with no default** — a dropped DELETE body must not pick the destructive branch. **Cascade soft-deletes**, so occurrences and paid coins survive. Also fixed a T-05 gap: undated one-offs (quick-add) were uncompletable — they now complete on today only |
| **T-07** | API: `GET /api/wallet` (balance = SUM(ledger)) + paginated ledger | S | sonnet | `architecture.md` §4.1 | ✅ Proven two ways: a `PRAGMA table_info` sweep asserts no balance-like column exists anywhere, and a row inserted straight into `ledger` moves the wallet on the next read — a cache could not. Ledger is **keyset**-paginated on `(created_at, id)`; `OFFSET` would skip rows as entries arrive |
| **W-01** | Web: login screen + API client + TanStack Query. **Added during T-08** — every endpoint is behind `requireAuth` and nothing in the backlog created a session, so no screen could fetch anything | S | sonnet | `architecture.md` §0.2 | ✅ PBKDF2 runs in the browser; only the derived key is posted. A 401 clears the token and redirects to `/login` |
| **T-08** | Web: home screen — Missed / Today / Backlog sections | L | sonnet | `prd/02-tasks.md` §Home, `design-system.md` | ✅ Three sections in spec order, verified against the seeded API. Section assembly is a pure function (`lib/home.ts`, 14 tests) — putting a task in the wrong section is invisible in a screenshot. Priority tint × epic accent renders at all 3 × 6 combinations on `/dev/ui` |
| **T-09** | Web: quick-add field | S | sonnet | `prd/02-tasks.md` §Enhancements | ✅ Enter or the `+` button; no navigation (asserted via the router location AND `defaultPrevented`). A failed submit **keeps the text and the focus**. Each submission carries its own idempotency key |
| **T-10** | Web: full task form — effort presets (15/30/60/90), reward defaulting to effort, routine/one-off switch, weekday picker | M | sonnet | `prd/02-tasks.md` | ✅ Both entry points asserted. Rules live in `lib/taskForm.ts` as a reducer (30 tests) — reward tracks effort until overridden, switching type discards the other type's scheduling, mask is bit 0 = Monday. **Create only** — editing is `T-10b` |
| **T-10b** | Web: edit an existing task — the same form, opened from a task row | S | sonnet | `prd/02-tasks.md`, T-10 output | ✅ Tapping a row's title opens the same sheet, seeded from the task. The type switch is **locked** and the save sends a **diff** — a full payload is refused three ways (carries `type`; a routine carrying `dueAt`; an empty patch), all three verified against the API. Single-task **delete** landed here too, with a confirm: `T-13b` only covers multi-select |
| **T-11** | Web: complete interaction — coin animation, balance ticker, **undo window**, optimistic mutation | M | sonnet | `prd/02-tasks.md` §Enhancements, `design-system.md` | ✅ A completion is **deferred, not rolled back** — undo clears the timer and no request is ever issued (asserted by advancing the clock past the window afterwards). Past the window, unticking calls `uncomplete`, which appends a reversing ledger row. Queue lives above the router and **flushes on unmount** rather than dropping coins |
| **T-12** | Web: weekly grid — tasks as rows, 7 weekday columns, toggle cells | M | sonnet | `prd/02-tasks.md` §Weekly grid | ✅ Five taps → mask 31 → exactly Mon–Fri generated (verified against the API). A cell edits the **weekday mask**, not completion — see the note below. Bit 0 = Monday, asserted per day. The last remaining day cannot be removed, because `weekdayMaskSchema` is min(1) |
| **T-12b** | Web: weekly completion view — the design bundle's version of this screen, where a cell ticks that day | M | sonnet | `docs/design/`, T-12 output | ✅ Both views behind a `Tabs` switch on `/week`. Ticking goes through **T-11's undo queue**, so the same misclick is reversible here and on Home. Unscheduled days are dots; **days still ahead are inert** (T-05 refuses them). Columns come from a shared `WeekGridShell`, so Monday-first exists in one place. ⚠️ **Schedule is the default** to preserve T-12's five-tap flow — in daily use Complete is probably the better default, worth revisiting |
| **T-13** | Web: epics screen + epic detail (expand in place) + CRUD | M | sonnet | `prd/03-epics.md` | ✅ CRUD works; add-task from an epic pre-fills, asserted through the real screen and the real `TaskForm`. Delete asks cascade-vs-unlink with **no default**, mirroring the API. The ratio is the server's and is never recomputed client-side |
| **T-13b** | Web: multi-select bulk duplicate/delete on the task lists | S | sonnet | `prd/02-tasks.md` §CRUD, T-03 output | ✅ Selection is a **mode** — the row's existing checkbox changes meaning, because one box cannot mean two things — and it keys on the **task**, not the row, so tapping Monday's routine marks every one of its rows and the blast radius is visible before the action. Duplicate acts immediately; delete asks first. Verified end-to-end: copies get new ids and no occurrence history, deletes are soft, and the coins already earned survive. Scoped to Home; the epic card's list is a plain `<ul>` (`TD-13`). Split out of T-13: a selection mode over a task list, not an epic concern, and it belongs on Home as much as inside an epic. Single-task delete is already done (T-10b), so this is only the multi-select case. `bulk-delete` and `bulk-duplicate` have existed since T-03 |

---

## Phase 3 — The spending loop

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **A-01** | `shared/economy.ts`: total album cost (coins + hours), expected value of a random pull, odds validation, **empty-tier redistribution**, duplicate refund | L | **opus** | `prd/04-albums.md` §Economy, `prd/05-stickers.md` §Random | ✅ **Redistribution needs no arithmetic**: proportionally sharing an empty tier's odds across the survivors is exactly renormalising the survivors, so the roll keeps their original odds as integer weights and divides once. Nothing rounds, so nothing drifts — proved by cross-multiplied property tests, not examples. Monotonicity is **non-increasing**, not strict (see note below). EV uses the *effective* odds: an empty tier can never pay out. Refund floors, which is what makes the dupe loss universal — property-tested over 2,000 prices. `tierForRoll(weights, r)` takes its randomness as an argument, so A-04 supplies entropy and holds no arithmetic |
| **A-02** | Image pipeline: canvas aspect-fill crop + drag-to-reposition, exact 591×827 / 1772×2480, JPEG q0.92, sha256 key, upload, `GET /api/images/:key` via cookie auth | L | **opus** | `prd/04-albums.md` §Geometry, `architecture.md` §5 | ✅ Verified against real R2: three successful PUTs of two distinct images leave **two blobs on disk**, and a cookie-only `GET` returns byte-identical JPEG. **The Worker derives the key itself** and refuses bytes that do not hash to the address they claim — otherwise `immutable` would be a lie. **Writes require the bearer header, reads accept the cookie**: an `<img>` cannot send a header, but a cookie rides along on cross-site requests, so only the read half of that trade is safe. Dimensions are enforced by parsing the JPEG frame header (no decode, ~200 bytes read) — a near-miss master otherwise breaks the print export weeks later. All crop geometry is pure in `shared/image.ts`; the canvas layer computes nothing, because jsdom cannot test it |
| **A-03** | API: create + seal album — sticker set, tier assignment, slot shuffle, all economics frozen. One `batch()`. **Sticker rows are insert-only** (the `sticker_frozen` trigger blocks all updates), so the full set must arrive in one POST; the wizard holds draft state client-side. | L | **opus** | `prd/04-albums.md` §Creating, §Sealing | ✅ Verified against real D1: a post-seal economics `UPDATE` and any sticker `UPDATE` both fail with `SQLITE_CONSTRAINT_TRIGGER` — the database rejects them, not this code — while `unlocked_at`/`completed_at` still move, or A-04 could never unlock anything. **D1 binds max 100 parameters per statement**, so the sticker inserts are chunked at 20 rows and passed to the *same* `batch()`: without that an album silently 500s on its 21st sticker (see `TD-15`). Slot order is Fisher–Yates, drawn once and stored. There is no separate seal endpoint and cannot be one — `sticker_frozen` makes a two-step flow impossible |
| **A-04a** | API: `spendStatement()` + unique index on `holding.sticker_id` + **unlock album** + **buy sticker directly** | M | **opus** | `prd/01-coins.md`, `architecture.md` §4.3, A-01 output | ✅ Verified end-to-end: 403 in a locked album, 402 with **literally zero rows** in `ledger` and `holding` and `unlocked_at` still null, then unlock → buy → 409 already-owned, ledger holding exactly the three expected signed rows. **`architecture.md` §4.3 was wrong and has been corrected in place** — a conditional insert matching nothing does not roll a batch back, so every post-spend write is gated on `PAID_FOR`. Guards read before paying are **repeated inside the spend's WHERE**; a concurrency test fires two unlocks at once and proves the read alone would double-charge. Migration `0003` makes `holding.sticker_id` UNIQUE (`ON CONFLICT` could not compile without it) |
| **A-04b** | API: **random pull** + **sell duplicate**, on A-04a's helper | M | **opus** | `prd/05-stickers.md` §Random, A-04a output | ✅ Verified end-to-end: 403 locked, pulls charging the album price with duplicates incrementing `quantity` on one row, a 25-coin pull refunding **12** (floored, so the dupe is a real loss), the last copy → 409, and a replayed key returning the **same sticker and the same balance**. **A duplicate is only reachable while some unowned sticker remains** — once nothing unowned can come back the pull is refused, so a one-sticker album can never produce one. A sale is a **credit and must not use `spend()`**, whose balance guard would demand the user already hold the coins being paid to them: `creditStatement()` sits beside it. The refund is written first (conditional on `quantity > 1`) and the decrement second, so no order of failure can pay without decrementing |

> **Split from A-04, and why it matters more than the size.** `architecture.md`
> §4.3 says "if the ledger insert changed 0 rows, the batch is rolled back and
> nothing happened." **That is false.** A conditional INSERT matching nothing is
> a *successful* statement affecting 0 rows — no error, so D1 rolls back
> nothing, and the follow-up write lands anyway: a broke user gets the sticker
> for free. Every second statement must be gated on the ledger row it depends
> on (`WHERE EXISTS (SELECT 1 FROM ledger WHERE id = ?)`), which works because a
> batch is one transaction. §4.3's `ON CONFLICT(sticker_id)` also could not run
> as written — `holding_sticker_idx` was a plain index, and SQLite requires a
> uniqueness constraint on a conflict target.
| **A-05** | API: album list with computed completion %, status filter, sort **+ `GET /api/albums/:id`** | M | sonnet | `prd/04-albums.md` | ✅ Completion is counted from the holdings on every read — a test inserts a holding **directly** and watches the percentage move with no write to `album`, which a stored column could not do. `completed_at` is stamped by a third statement inside the purchase batch, gated on payment, so it lands the instant the last slot is filled and never on a read path; `completed_at IS NULL` makes "exactly once" structural. Percent **floors**, so only a genuinely full album reports 100 — the export gate reads that number. Detail returns unowned slots with `quantity: 0` rather than omitting them, because a locked slot still has to render its rarity frame. **The detail endpoint had no backlog row at all** and A-08 is blocked without it, so it landed here |
| **A-06** | Web: album grid — locked B&W, unlocked colour, progress bar, "almost there" surfacing, affordability cue | M | sonnet | `prd/04-albums.md`, `design-system.md` | ✅ Locked and unlocked render the **identical `src`** and differ only by `--filter-locked` — asserted directly, and a mutant that appends `?bw=1` to the locked cover dies on it. Status both filters (tabs) and sorts (chips) server-side, so completion is never recomputed client-side. **Unlock landed here** — §Locked 2 puts the button on the card and no other row owned the action — behind a confirmation, because the ledger is append-only and a mis-tap cannot be undone; the confirm disables when the coins are short rather than letting the API 402. Cards link to `/albums/:id`, whose **placeholder `routes/AlbumDetail.tsx` A-08 must replace wholesale** |
| **A-07a** | Web: the album draft — reducer + validation + **IndexedDB persistence** + the **live economy preview** | M | sonnet | `prd/04-albums.md` §Creating, A-01 output | ✅ The preview renders **no control at all** — no button, no input — which is how "neither figure blocks sealing" is enforced rather than remembered. Cost shows in coins *and* hours (4,200 → 70 hours), and EV uses the **effective** odds so an empty tier's price is never advertised. Odds validation is `validateOdds`, shared with the route and the CHECK. `toPayload` is parsed by the **real `createAlbumSchema`** in a test, so the wizard cannot invent a shape the API rejects. Draft persistence is tested against `fake-indexeddb`; a half-written record is discarded rather than crashing the wizard |
| **A-07b** | Web: the wizard screens — steps, cover + sticker crop, tier assignment, upload orchestration, seal confirmation | L | sonnet | `prd/04-albums.md` §Creating, A-07a output, A-02 output | ✅ Images upload at **import** time, so a key only ever reaches the draft after the bytes are stored — a failed upload adds nothing and says why. The draft is cleared **after** the album exists, never before, so a refused seal loses nothing. Tested against real IndexedDB (`fake-indexeddb`) with `ImageCropper` stubbed, since jsdom has no canvas — the pixels stay untested, the orchestration does not. **The `Create` button on the listing landed here** (§Creating 1, which A-06's row never covered) |

> **Split from A-07, plus the decision that made it possible.** The draft stores
> **image keys, not image bytes**: each sticker is cropped and uploaded as it is
> added, so the persisted draft is a small JSON object that is exactly
> `CreateAlbumInput` rather than megabytes of blobs in IndexedDB. Content
> addressing is what makes that safe — re-adding an image costs zero bytes and
> the key never changes. The cost is orphaned R2 objects when a wizard is
> abandoned (`TD-17`).
| **A-08** | Web: album detail — sticker grid, rarity frames on locked slots, duplicate quantity badge, missing-only toggle | M | sonnet | `prd/05-stickers.md`, A-05 output | ✅ The frame is the bezel **behind** the art — gradient plus `--frame-pad-*` widening 4→7px — so an *unowned* legendary is distinguishable from an unowned common with no art loaded at all, which is the criterion. Direct buy is priced by the slot's own tier and is absent inside a locked album; browsing one is still allowed. Duplicates count only past the first copy. **No pull button here** — A-09 owns the reveal *and* the inline sell, and a pull without the sell is the dead end §Enhancements warns about |
| **A-09** | Web: the reveal — B&W floods to colour, held longer for higher tiers; inline "sell for X" on a duplicate. **Also adds the random-pull button to the album detail**, deliberately deferred from A-08 so a pull never lands without its sell affordance | M | sonnet | `prd/05-stickers.md` §Enhancements, A-04b output, A-08 output | ✅ A duplicate reveal offers **Sell for N** beside **Keep it**; a first copy offers neither, because the last copy is the collection. The pull button uses `canPullRandom` — the same function the Worker uses — so it refuses a roll the API would 409, including the case that is *not* completion: unowned stickers stranded in a zero-odds tier. **The sale is also reachable from the grid** (`Sell ×N`), or `duplicate_sale` would exist for four seconds per pull and spares would pile up forever. The per-tier hold is pinned to `--duration-shake-*` **by a test that reads `tokens.css`**, since a JS timer cannot read a custom property and a hand-copied constant drifts |
| **A-10** | Web: create-from-existing (inherits images by key, no re-upload, no ownership carried) | M | sonnet | `prd/04-albums.md` §Creating from existing | ✅ **Zero bytes uploaded** — asserted directly: seeding and sealing an edition makes no request to `/api/images` and never calls `uploadImage`. Ownership cannot be carried because a draft has no way to express it; a seeded sticker is `{imageKey, tier}` and nothing else. §Creating 2's **from-scratch/from-existing chooser landed here** (A-07b built the steps without it); it is shown only while the draft is pristine, so returning to half-built work never asks again |
| **A-11** | **API + Web:** delete album — soft delete, warning + type-the-title confirmation (trimmed, case-insensitive) | M | sonnet | `prd/04-albums.md` §Deleting | ✅ **The row said "Web" and "S", and both were wrong: no delete endpoint existed.** A hard delete is also impossible — `ledger.album_id` is a foreign key, the spend rows must survive (nothing is refunded), and repointing them is blocked by `ledger_no_update`. So the album row outlives the album and every read filters through one shared `liveAlbums` predicate; verified end-to-end that detail, unlock, buy and pull all 404 afterwards while the balance and all three ledger rows are untouched. The confirm stays disabled until the title matches, trimmed and case-insensitive |

> **Spec resolution, decided in A-01 — odds are non-increasing, not strictly decreasing.**
> `prd/04-albums.md` §Creating 8 says drop odds "must decrease from common to
> legendary", while `prd/05-stickers.md` §Random 5 permits a tier with zero odds.
> Two zero tiers (`70/30/0/0`) satisfy the second and violate the first, so read
> strictly the rules contradict. `validateOdds` implements `common ≥ rare ≥ epic
> ≥ legendary`, which satisfies both: a rarer tier is never likelier than a
> commoner one, and any number of tiers may sit at zero. A-07's wizard must
> validate the same way — one rule, one implementation.

---

## Phase 4 — Print export

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
> **Geometry warning for E-01, found in A-02.** `prd/04-albums.md` §Geometry says
> "the cover is exactly three times the sticker". That is true in millimetres
> (50 → 150) and **false in stored pixels**: 591 × 3 = 1773 against a stored
> 1772, and 827 × 3 = 2481 against 2480, because each dimension is rounded from
> 300 dpi independently. Lay the PDF out from the physical millimetres; do not
> assume the pixel dimensions divide. `IMAGE_SIZES` in `shared/image.ts` carries
> the same warning, and a test pins the exact values.

| **E-01** | `lib/pdf.ts` + `lib/pdfLayout.ts` with `pdf-lib`: cover page, 3×3 sticker pages, rarity frames, 0.25 pt cut guides, footer, A4 + Letter | L | **opus** | `prd/06-export.md`, `architecture.md` §10 | ✅ Geometry is pure and asserted to the point against §10's own table on both papers; `pdf.ts` draws and computes nothing. **Verified by reading a generated PDF back with an independent parser (pypdf):** 3 pages for 12 stickers, A4 at 595.28 × 841.89, every image `/DCTDecode` at its **native pixel size** (591×827, 1772×2480) drawn at exactly 141.73 × 198.43 pt with 34.02 pt gutters — no resampling anywhere. Every position derives from **millimetres**, never the pixel dimensions (the cover is 3× the sticker in mm and not in px). Each distinct image is embedded **once**, not once per placement. Print inks live in `tokens.css` as `--print-*`, read at export time, so no colour literal reaches TypeScript |
| **E-02** | Export UI — gated on completion, re-runnable forever, filename `sticker-collector-{slug}-{yyyy-mm-dd}.pdf` | S | sonnet | `prd/06-export.md` | ✅ The panel renders only for a completed album — absent while a slot is empty and absent on a locked one however full it looks — and exporting three times in a row produces three files, because nothing records or limits it. Each distinct image is fetched **once** (a derived edition can repeat a key) over the cookie-authenticated same-origin endpoint. **A failed image aborts the export**: `pdf.ts` would print the frame with a blank square, and no file beats a bad artifact. Letter vs A4 is asserted on the **saved document** via pdf-lib, not on the argument |

---

## Phase 5 — Reports

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **R-01** | `shared/reports.ts` + `GET /api/reports/momentum`: per-routine streak, longest streak, perfect days, completion rate (7/30/90), weekday shape | L | **opus** | `prd/08-reports.md` | ✅ Verified on real data: a Mon/Wed/Fri routine keeps a streak of 2 **across the unscheduled Tuesday**, and a missed scheduled day breaks it. The walk steps over the *schedule*, not the calendar, because occurrences are derived — only the mask knows whether a day was scheduled. **Weekday shape is Monday-first**, checked by delta on the running app: a Tuesday-only routine lands entirely on `Tue` with zero leakage, which is the rotated histogram CLAUDE.md warns about. Decisions recorded in the module: today never breaks anything (an open day is not a miss); a day with **nothing scheduled is not a perfect day** and does not break the run; rates are `null` rather than 0% when nothing was scheduled; history is bounded to 366 days and the boundary is pinned by test |
| **R-02** | `GET /api/reports/effort`: minutes invested per week/month, effort by epic, stickers over time, albums completed | M | sonnet | `prd/08-reports.md` | ✅ Nothing new is tracked. **Minutes come from the ledger, not occurrence snapshots** — uncompleting appends a negative `task_reward` and leaves the snapshot intact (the trigger forbids nulling it), so a snapshot sum would count work that was taken back. Rewards are dated by the occurrence's **scheduled day**, not by when the row was written, or a reversal typed today would overstate last week and push a negative into this one. Spending is excluded: an album unlock is a large negative row and would read as negative effort, which is the economic framing the spec puts out of scope. Weeks are keyed by their **Monday's date** rather than an ISO week number (`2026-W53` and year-boundary weeks are a class of bug worth not importing) |
| **R-03** | Web: heatmap (year of cells, shaded by proportion completed) | M | sonnet | `prd/08-reports.md` | ✅ A gap is visible because the bottom of the scale has **two states, not one**: a day scheduled-and-missed is painted differently from a day with nothing scheduled — conflating them turns every rest day into a failure and every failure into a rest day. Rows are Monday-first (a Sunday-first grid puts every cell one row out and looks plausible). Data comes from `MomentumReport.days`, **the same tally the rates and perfect days use**, so the three cannot disagree; a test asserts the series and the trailing rate report the same completions. Every cell carries its own label — a colour alone is not a report |
| **R-04** | Web: reports screen assembling R-01/R-02/R-03 | M | sonnet | `design-system.md` | ✅ "Nothing economic" is enforced by two checkable tests, not by intent: the screen **never fetches `/api/wallet`** (a balance is the obvious thing to reach for on a stats page, so its absence is the signal) and no balance/price/spend wording renders. Minutes stay in scope because a coin *is* a minute — it measures work done, not money moved. A `null` rate reads **“—”, never 0%**, asserted *within the card* since the weekday bars also render dashes. Weekday bars are rendered in the order the API sends (Monday-first); a mutant that re-sorts them dies. A user with no history gets an invitation rather than seven zeros |

---

## Phase 6 — Hardening

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| **H-01** | PWA manifest, icon set, iOS splash screens, `apple-touch-icon`, install prompt | M | sonnet | `architecture.md` §6 | ✅ **The row's criterion needs a phone and could not be verified here** — what is proven instead: the Worker serves the manifest as `application/manifest+json` with `display: standalone`, every declared icon exists at exactly the pixel size it claims (a lying `sizes` is the classic silent install failure), and all five launch images resolve with their media queries. Icons are **generated by `scripts/generate-icons.mjs`** rather than committed binaries, so they are reviewable as code — placeholder artwork, see `TD-22`. The install prompt handles the two platforms separately: Chrome's `beforeinstallprompt` is **held** for a gesture, iOS gets instructions because no such event ever fires, and a dismissal is permanent |
| **H-02** | Service worker: precache shell, `CacheFirst` images, `SWR` reads, update toast | M | sonnet | `architecture.md` §6 | ✅ **The row's criterion needs a browser and could not be run here** — what is proven instead: the *generated* `dist/sw.js` precaches 19 entries (HTML, JS, CSS, fonts, icons, manifest — **1.14 MiB, no splash art**) and registers exactly four routes: navigation fallback with `/api` **denied**, `GET /api/images/*` → CacheFirst (200s only), `GET /api/*` → SWR, woff2 → CacheFirst. Rules live in `pwa.config.ts` as **data** so they can be asserted without a build. **There is deliberately no `NetworkOnly` rule for mutations** — Workbox registers routes for GET unless told otherwise, so a `method !== "GET"` matcher compiles to dead code that reads as protection; the real invariant is "nothing matches a mutation", and that is what the test asserts |
| **H-03a** | API: `GET /api/backup/manifest` + `POST /api/backup/restore` | M | **opus** | `prd/07-services.md`, `architecture.md` §9 | ✅ Round trip verified against real D1: balance, albums, stickers, holdings (**including duplicate quantities**) and image keys all reproduce, compared on **content** rather than identity. **Every row is given a fresh id and every reference rewritten** — keeping ids collides on the primary key the moment a backup meets a database that already holds those rows. A restore is **one batch**: a forced mid-restore failure leaves zero epics, tasks and albums, because half an account looks like a success and is missing half the history. The manifest carries **no `auth_key_hash`, salt, iterations or idempotency keys** — that file is the recovery path for a *lost passphrase*, so restoring the old credential would defeat it. D1's 100-parameter ceiling bites on **reads** too (`IN (?, …)` with 200 ids), so scoped SELECTs are chunked |
| **H-03b** | Web: `fflate` archive build/parse in a worker, export download, restore gated on typing `RESTORE` | M | sonnet | `architecture.md` §9, H-03a output | ✅ Round trip proven: build → parse returns the manifest **deep-equal** and every image **byte-identical**, at the 200-sticker maximum too. Images live at **their own key path** inside the zip, so parsing reconstructs keys directly instead of via a convention that could drift. They are **stored, not deflated** — re-compressing sixty JPEGs costs phone CPU to make the file bigger. On restore, **images upload before the manifest posts**: the other order leaves albums referencing images that were never uploaded, which looks complete and is not. The manifest is validated on read with the **same schema the API uses**, so a file this accepts is one the server accepts. **A `/settings` route landed here** — the backup had nowhere to live and H-04 assumed one existed |

> **Split from H-03, because of an invariant the row could not have known about.**
> `ledger_no_delete` aborts every DELETE on the ledger, so "wipe and restore"
> **cannot** mean the API clearing it — and CLAUDE.md forbids dropping a trigger
> to make code work. Restore therefore refuses an account that already holds
> data and restores into an empty one, which is what the spec's own recovery
> story describes: a lost passphrase or an evicted browser, restored into a
> fresh instance. Rows keep their ids; `user_id` is rewritten to whoever is
> authenticated, so a backup is portable between deployments.
| **H-04** | Backup nudge after album create/complete + last-export date in settings | S | haiku | `prd/07-services.md`, H-03b output | ✅ The nudge is **derived, not fired**: it compares the newest `createdAt`/`completedAt` in the album listing against the last export, so it needs no event plumbing from the seal or from whichever purchase completed the album — and a missed event cannot mean a nudge that never comes. Dismissal is **per-timestamp**: a new album asks again, because a nudge you can silence forever is not insurance. The date is recorded **only on a successful export**. Stored in `localStorage` (`TD-23`) |
| **H-05** | Error boundaries, empty states, loading skeletons across all screens | M | sonnet | `design-system.md` | No blank screen anywhere |
| **H-06** | Playwright smoke: (1) complete task → coins → unlock album → buy sticker; (2) complete album → export PDF | M | sonnet | — | Both run in CI |

---

## Phase 7 — After go-live

From the spec's own list, plus what I've deferred. Do not start these until Phase 6 ships.

`P-01` Strong sticker-purchase animation · `P-02` Strong album-purchase animation · `P-03` Strong album-completion animation · `P-04` Print/export preview · `P-05` Settings screen · `P-06` Onboarding · `P-07` **Offline outbox** (queue completions in IndexedDB, replay via existing idempotency keys) · `P-08` Web Push reminders (VAPID + one Cron Trigger; iOS requires installed PWA) · `P-09` Export spec doc as PDF

---

## Post-MVP

Phase 7 above holds the *product* features deferred from the spec. This section
holds two other things: what `W-01` deliberately left unfinished, and the debt
that accumulated while building. Nothing here blocks the MVP; everything here
was a conscious trade, recorded at the moment it was made rather than
discovered later.

### Auth & session — finishing `W-01`

`W-01` shipped the smallest login that unblocks every screen: fetch the salt,
stretch the passphrase in the browser, post the derived key, store the token.
That is the whole of it. Everything below is missing.

| ID | Task | Size | Why it was left out |
|---|---|---|---|
| **A-W1** | **Logout.** Clear the token and the `sc_session` cookie, return to `/login` | S | Nothing in the MVP flow needs it on a single-user device. But there is currently *no way* to sign out — a session lasts 90 days or until localStorage is cleared by hand |
| **A-W2** | **Passphrase provisioning.** A first-run flow that sets `auth_key_hash`, `kdf_salt`, `kdf_iterations` for a user who does not exist yet | M | Today the only user is created by `pnpm seed`. **Production has no way to onboard.** Pairs with `P-06 Onboarding` |
| **A-W3** | **Change passphrase.** Re-derive with a fresh salt and rotate the stored hash | S | Belongs with `P-05 Settings` |
| **A-W4** | **Session-expiry UX.** A 401 currently drops the user on `/login` with no explanation | S | Correct behaviour, unfriendly presentation |
| **A-W5** | **Prune `mutation` and `auth_attempt`.** Both tables grow forever — one row per mutation, one per login attempt window | S | Harmless for months at single-user volume, unbounded in principle. A Cron Trigger deleting rows older than ~7 days. Pairs with `P-08`, which needs a Cron Trigger anyway |

### Technical debt

Ordered by how likely it is to cost someone real time.

| ID | Debt | Where it came from | Cost of leaving it |
|---|---|---|---|
| ~~**TD-01**~~ | ~~**No component-test setup in `packages/web`**~~ ✅ **Done.** jsdom + React Testing Library, behaviour-scoped, no snapshots. `TaskRow` asserts the priority→token and epic→token mappings and that the two are independent; `lib/api.ts` asserts a 401 clears the session while every other status leaves it alone. See `packages/web/test/README.md` | Offered during D-02 and D-04, declined; done after T-08 | **Still owed:** T-11 must bring "undo inside the window issues no request" and T-12 "a cell toggles the correct mask bit (bit 0 = Monday)". Both are named in the test README so the requirement travels with the harness |
| **TD-02** | **`docs/design-system.md` can drift silently.** Nothing checks the inventory against the actual exports | D-05 | The file is the contract ~40 later tasks read instead of the design bundle. A stale row sends a task down the wrong path. The fix is the same export-vs-inventory diff already run manually in D-05, wired into CI beside `check-tokens.sh` |
| **TD-03** | **Border widths are not tokenised.** `border-[1.5px]` in `Chip`, `border-l-[3px]` in `TaskRow` | D-02, T-08 | `CLAUDE.md` claims "literal hex **or px** values fail CI"; only `font-size` px are actually caught. Closing it means adding a `--border-*` family, then widening `check-tokens.sh`. Until then `CLAUDE.md` states the exception explicitly and points here |
| ~~**TD-04**~~ | ~~**`Toast` is presentational only**~~ ✅ **Done.** T-11 built the queue as `lib/completionQueue.tsx`, which owns the timers and renders its own `ToastViewport`. `Toast` itself stayed presentational | D-03, by design | — |
| **TD-05** | **Three components were invented, not transcribed:** `Toast`, `EmptyState`, `Skeleton` | D-03 — they appear **nowhere** in the design bundle | They follow the system's language but have had no design review. Most likely of all the primitives to need rework |
| **TD-06** | **Per-tier reveal durations are interpolated.** 560 / 680 / 820 / 1000 ms | D-01 — the prototype specifies only the endpoints (560 non-legendary, 1000 legendary) | Cosmetic, and retunable in one place (`--duration-shake-*`). Listed so nobody mistakes the middle two for measured values |
| **TD-07** | **`routes/auth.ts` and `lib/rate-limit.ts` are still raw D1** while everything from T-03 onward uses Drizzle | F-05 predates the T-03 decision | Mixed idiom in one package. `spend()` stays raw **permanently** and correctly — its balance guard must live inside the SQL (§4.3) — but auth has no such excuse |
| **TD-08** | **`index.html` is outside the token guard** | D-06 | `H-01` adds `theme-color` and a PWA manifest, where a literal hex is correct and unavoidable. Needs an allowlist before that lands, or H-01 will either break CI or force the guard to be weakened |
| **TD-09** | **`lastCompletedOn` reports `MAX(scheduled_on)`, not the completion instant** | T-08 | A task completed *late* reports the day it was scheduled for, not the day it was done. Correct for "is this backlog item finished?", which is all it is used for — but wrong if a report ever reads it as a completion date |
| **TD-10** | **A soft-deleted task's history is invisible in `GET /api/occurrences`** | T-04, deliberate | `occurrenceSchema` carries no task fields, so the client joins against `GET /api/tasks`, which excludes deleted tasks — it would render rows it cannot label. Reports read the ledger instead, so nothing is lost today. Revisit if a screen ever needs to show completed work from a deleted task |
| **TD-12** | **`Input` remounts when an error appears.** It returns a bare `<input>` with no label/hint/error and a `<Field>`-wrapped one otherwise, so gaining an error changes the tree shape — React unmounts the field and the user loses focus and caret mid-typing | Found in T-09, when quick-add used the `error` slot | Any label-less input that can fail. `QuickAdd` works around it by rendering its own message; a form with a permanent label never switches, so T-10 is unaffected. Fix is to always wrap in `Field` — small, but it moves the flex target from the input to the wrapper in every current usage |
| **TD-23** | **The last-export date lives in `localStorage`.** The export exists partly as insurance against the browser clearing its storage — and clearing it takes the date with it, so a restored install reads "never backed up" | H-04 | Harmless in the small (the user is told to make a backup they may already have) but the wrong home: `prd/07-services.md` is explicit that the server is the source of truth and local storage is only a cache. Fix is a `last_exported_at` column on `user` and a one-line endpoint — deferred because it is a migration for a date nothing acts on automatically |
| **TD-22** | **The app icon and launch images are placeholders, and the iOS splash matrix is partial.** `scripts/generate-icons.mjs` draws a coin disc from the design tokens — legible and correctly sized, but not designed. Five iPhone launch images are generated; a complete set is ~20 device-specific files | H-01 | Real artwork drops into `public/icons/` and `public/splash/` without touching the manifest or the HTML. The uncovered devices fall back to `background_color`, so the worst case is a flat launch screen in the app's own colour rather than a white flash |
| **TD-21** | **`asyncUtilTimeout` must stay well under `testTimeout`.** R-03 raised RTL's async-query timeout to 5 s to stop load-induced false failures — but vitest's `testTimeout` was also 5 s, so a retrying query stopped failing fast and blew the *test* timeout instead, reporting "timed out in 5000ms" and naming no element. Strictly worse than the problem it fixed | R-04 verification | Fixed: 3 s async against 20 s test. The general point is that the two numbers are a pair — raising one without the other converts a clear failure into an opaque one |
| **TD-20** | **`pnpm test` is unreliable while `pnpm dev` is running.** With a `wrangler dev` alive, the first full run of a batch failed 42, then 12, then 7 tests; with no wrangler/workerd process alive, five consecutive runs were clean. The api suite spawns its own workerd via `vitest-pool-workers`, and a dev server's workerd contends for `.wrangler/state` | R-03 verification; also explains the single unreproduced failure flagged in A-10 | Nothing is broken in the code — but a mass failure that vanishes on re-run costs an hour of trust. Worth either a `pretest` guard that refuses to run while port 8787 is held, or separate state directories for dev and test |
| **TD-19** | **Two flaky tests, both mine, both found by running the suite repeatedly rather than once.** `pulls.test.ts` asserted a duplicate appears within 5 pulls at 99:1 odds — but one unlucky 1% roll completed the album and 409'd every later pull, so it failed ~1% of the time (I had called it "essentially certain"). And RTL's 1 s `asyncUtilTimeout` produced false failures on a loaded machine, where a 20 ms query took 1.5 s | R-03 verification | Both fixed: six rares instead of one (failure ~1e-12), and `asyncUtilTimeout: 5000` in the web setup. The lesson is the process one — a single green run proves very little, and a probability argument in a test deserves the same scrutiny as the code |
| **TD-18** | **`Input` and `Textarea` produce an unlabelled control when `id` is omitted.** They pass `htmlFor={id}` to `Field`, so with no `id` the `<label>` points at nothing — the field looks correct and is invisible to a screen reader | Found in A-07b, where four wizard fields were silently unlabelled until a test asked for one by label | Every caller must remember an `id`, and nothing enforces it. Fix is a `useId()` fallback inside both primitives — small, and it retro-fixes any caller that already forgot. Related to `TD-12`, which is the other `Field`-wiring defect |
| **TD-17** | **An abandoned creation wizard orphans R2 objects.** A-07a uploads each sticker as it is cropped so the draft can stay small, but nothing deletes those objects if the album is never sealed | A-07a | Untracked and uncollected — the spec has no cleanup story anywhere. Content addressing bounds the damage (re-adding the same image is free, and a later album that uses the image adopts it), but a user who abandons ten wizards leaves ten sets of masters. Fix is either a `draft_image` table with a sweep, or moving the upload to seal time and paying the blob cost in IndexedDB |
| **TD-16** | **Two routers on one prefix ran the idempotency middleware twice.** `albums.ts` registered it on `POST *` and `purchases.ts` mounts on the same `/api/albums`, so a purchase claimed its key in the first middleware and then 409'd against its own in-flight claim in the second | A-04a; same shape as the T-09 double-match bug | Fixed by attaching `idempotency` per route instead of by wildcard. The pattern is a trap worth a lint rule or a mounting convention — this is the second time it has cost a debugging session |
| **TD-15** | **D1 binds at most 100 parameters per statement.** Found in A-03, where a 24-sticker album 500s on a single multi-row `INSERT` (5 columns × 21 rows > 100) while 20 seals fine — the failure is invisible below 21 rows | A-03 | Handled there by chunking at 20 rows inside one `batch()`. Any other multi-row insert has the same ceiling; `bulk-duplicate` (T-03) inserts full task rows and would break at a far smaller count. Worth a shared `chunkedInsert` helper before the next one |
| **TD-14** | **A duplicated task is indistinguishable from its original.** `bulk-duplicate` copies the title verbatim, so the list shows two identical rows with nothing to tell them apart — and in selection mode that is how the wrong one gets deleted | T-13b, verified against the running Worker | The PRD does not ask for a suffix, so this is a deliberate deferral, not a bug. Fix is server-side in `bulk-duplicate` (a `(copy)` suffix, or `(copy 2)` when one exists) so the API and the UI cannot disagree about the name |
| **TD-13** | **Multi-select is Home-only.** The epic card's task list is a plain `<ul>` of titles, not `TaskRow`, so it has no selection mode | T-13b | `prd/02-tasks.md` §5 says "select multiple tasks", without naming a screen; Home satisfies it. Fix is to render epic tasks through `TaskRow` and lift `useSelection` into the epic card — the hook and `SelectionBar` are already screen-agnostic |
| **TD-11** | **The design bundle is committed at ~1.6 MB**, mostly sticker PNGs, and includes `_ds/classical-*` — a theme that is **not** this product's design system | D-01 | `architecture.md` §7 says `design/` should be gitignored, but D-02–D-04 name it as a `Load` input. Now that `docs/design-system.md` exists, the bundle is read only when the system itself changes, so it could move out of the repo |

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
| 0 Foundation | 10 | 10 | ✅ complete — deployed & healthy at sticker-collector.jailson-junior36.workers.dev |
| 1 Design system | 6 | 6 | ✅ complete — read `docs/design-system.md`, not `docs/design/`. Live at `/dev/ui` |
| 2 Earning loop | 17 | 17 | ✅ complete — the earning loop runs end to end: create, schedule, complete with undo, edit, bulk act |
| 3 Spending loop | 13 | 13 | ✅ complete — author, seal, unlock, buy, pull, sell and delete all work end to end |
| 4 Export | 2 | 2 | ✅ complete — a finished album prints to a true-size PDF |
| 5 Reports | 4 | 4 | ✅ complete — momentum on screen, nothing economic |
| 6 Hardening | 5 | 7 | 🔄 H-05 (error boundaries, empty states) and H-06 (Playwright smoke) remain |
| **MVP total** | **57** | **59** | |

Post-MVP is tracked separately and deliberately excluded from the total: 5 auth
follow-ups (`A-W1`–`A-W5`) and 23 technical-debt items (`TD-01`–`TD-23`). See
**Post-MVP** above. `TD-01` is done and both tests it still owed (T-11's undo,
T-12's mask bit) have landed — `packages/web/test/README.md` records the rules.
