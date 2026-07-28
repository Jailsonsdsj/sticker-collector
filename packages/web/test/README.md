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

## Querying screens that mount sheets

jsdom does not apply the UA stylesheet rule that hides a closed `<dialog>`, so a
sheet that is mounted-but-closed is still queryable. On a screen with two sheets
— the epic form and the task form, say — `getByLabelText(/title/i)` matches
both, and an epic's name appears twice: once as its card heading, once as a chip
inside the closed task form.

Scope to what a person can actually see:

```ts
const sheet = () => within(document.querySelector("dialog[open]") as HTMLElement);
sheet().getByLabelText(/title/i);
```

The same applies to `role` queries. Where two controls share a name, prefer the
distinguishing ARIA attribute (`aria-expanded` for a disclosure, `aria-pressed`
for a chip) over adding test ids.

## Why this exists

`packages/shared` and `packages/api` are covered by unit and Workers-pool tests.
The interactive layer had none: it was verified by eye, once, by whoever wrote
it. These tests are that layer's **only** enforcement mechanism. See `TD-01` in
`docs/backlog.md`.

## Owed by later tasks

Two behaviours were named in `TD-01` and could not be written until the code
existed. Both have since landed:

- ~~**T-11 — the undo window.**~~ ✅ Delivered in `src/lib/completionQueue.test.tsx`.
  Every case asserts `onCommit` was never called AND advances the clock past the
  window afterwards, so a late fire cannot hide.
- ~~**T-12 — the weekly grid.**~~ ✅ Delivered in `src/components/WeeklyGrid.test.tsx`.
  Each of the seven cells is asserted individually, and the columns are checked
  to render Monday-first so the bit order and the layout cannot drift apart.

Both are done. Anything new that is stateful or interactive should arrive with
its own behaviour test — that is the standing rule, not a backlog item.
