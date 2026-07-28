# Web tests

`vitest --project web`, jsdom + React Testing Library. Config lives in
`packages/web/vitest.config.ts`; tests sit beside the code they cover
(`src/**/*.test.ts[x]`).

## Scope: behaviour, not markup

**No snapshot tests.** A snapshot records what the DOM happens to be, which is
precisely the thing that changes for good reasons and fails for no reason. It
also passes whether or not the component works.

Assert what the component *decides*, not what it renders:

| Don't | Do |
|---|---|
| `expect(el.className).toContain("bg-prio-high-row")` | `expect(el.style.getPropertyValue("--ui-row")).toBe("var(--color-prio-high-row)")` |
| snapshot the row | assert the checkbox is checked, the callback fired, the token resolved |

jsdom loads no stylesheet, so a computed colour is unassertable anyway — but the
custom properties a component writes *are* its output. Tailwind only consumes
them.

## Why this exists

`packages/shared` and `packages/api` are covered by unit and Workers-pool tests.
The interactive layer had none: it was verified by eye, once, by whoever wrote
it. These tests are that layer's **only** enforcement mechanism. See `TD-01` in
`docs/backlog.md`.

## Owed by later tasks

Two behaviours are named in `TD-01` and cannot be written until the code exists.
Whoever builds these must bring the test with them:

- ~~**T-11 — the undo window.**~~ ✅ Delivered in `src/lib/completionQueue.test.tsx`.
  Every case asserts `onCommit` was never called AND advances the clock past the
  window afterwards, so a late fire cannot hide.
- **T-12 — the weekly grid.** Toggling a cell must flip the correct bit of the
  weekday mask. **Bit 0 is Monday** (`shared/recurrence.ts`); the grid renders
  Monday-first, so an off-by-one here is invisible on screen and moves a
  routine to the wrong day. The test: toggle each of the seven cells and assert
  the exact mask sent.
