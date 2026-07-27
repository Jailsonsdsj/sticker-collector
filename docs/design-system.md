# Design system — component inventory

**This file replaces the design bundle.** Every UI task in Phases 2–6 reads this table, not `docs/design/`. Open the bundle only if you are changing the system itself.

The live counterpart is **`/dev/ui`** — every component in every variant × state, on a page that ships with the app and works on a real phone. `pnpm --filter @sticker-collector/web dev`, then http://localhost:5173/dev/ui.

```ts
import { Button, Input, Chip } from "../components/ui";
import { AppHeader, StickerGrid } from "../components/layout";
```

**Two rules.** Colours, spacing and type come from `styles/tokens.css` only — `scripts/check-tokens.sh` fails CI on a literal hex, `rgb()` or px font-size anywhere else. And every component already takes tokens as its only styling input, so extend via `className`, never by overriding a colour.

---

## Primitives — `packages/web/src/components/ui/`

Defaults are in **bold**.

| Component | File | Props | States | Tokens used |
|---|---|---|---|---|
| `Button` | `ui/Button.tsx` | `variant` **solid**·outline·ghost·holo · `tone` **coin**·lime·magenta·violet·cyan·neutral · `size` sm·**md**·lg · `block` · `loading` · `disabled` · all `<button>` props | default, hover, active (translates 2px into the lip), focus-visible, disabled, loading | `--color-{coin,lime,magenta,violet,cyan,surface-2}` · `--shadow-lip-*` + `-pressed` · `--gradient-{cta,cta-hot,holo,cool}` · `--radius-lg/xl` · `--text-md/base` |
| `Input` | `ui/Input.tsx` | `tone` **default**·numeric·coin·url·danger · `size` sm·**md** · `invalid` · `label` · `hint` · `required` · `error` · `id` · all `<input>` props | default, hover, focus-visible, invalid, disabled | `--color-panel` · `--color-surface-4` · `--color-ink`/`-dim` · `--color-{coin,cyan,magenta}` · `--radius-lg` · `--font-body/numeric` |
| `Textarea` | `ui/Textarea.tsx` | `rows` **2** · `resizable` **false** · `size` · `invalid` · `label` · `hint` · `required` · `error` · all `<textarea>` props | as `Input` | as `Input` |
| `Field` | `ui/Field.tsx` | `label` · `hint` · `required` · `error` · `htmlFor` · `children` | with/without label, hint, error | `--color-ink-muted` · `--color-coin` (hint) · `--color-prio-high-fg` (asterisk, error) · `--tracking-kicker` |
| `Chip` | `ui/Chip.tsx` | `tone` coin·**lime**·violet·cyan·magenta·low·med·high · `shape` **pill**·rounded · `size` sm·**md** · `fill` **solid**·tint · `surface` **bare**·filled · `font` body·**numeric** · `selected` | unselected (bare/filled), selected (solid/tint), hover, focus-visible, disabled | accent colours · `--color-prio-*-tag`/`-tag-border`/`-fg` · `--color-border-strong` · `--color-surface-2/4` · `--color-ink`/`-secondary`/`-inverse` · `--radius-full/lg` |
| `Checkbox` | `ui/Checkbox.tsx` | `checked` · `onChange(checked: boolean)` · `size` sm·**md** · `muted` · `ring` · `label` · `disabled` | unchecked, checked, muted (unscheduled — inert, shows `·`), disabled, focus-visible, ring (today) | `--color-lime` · `--color-check-off` · `--color-cell-idle` · `--color-ink-ghost` · `--color-ring-today` · `--radius-md` |
| `Badge` | `ui/Badge.tsx` | `tone` low·med·high·coin·lime·magenta·cyan·violet·**neutral** · `variant` **tint**·solid·overlay · `size` sm·**md** · `font` **body**·numeric | static | `--color-prio-*-tag`/`-tag-border`/`-fg` · accent colours · `--color-scrim` · `--color-ink-overlay` · `--radius-sm/md` · `--text-3xs/2xs` |
| `Sheet` | `ui/Sheet.tsx` | `open` · `onClose` · `title` · `leading` · `trailing` · `toolbar` · `children` | closed, open (slides up) | `--color-void` · `--color-border` · `--color-scrim-modal` · `--animate-sheet-in`/`-scrim-in` · `--font-display` |
| `Dialog` | `ui/Dialog.tsx` | `open` · `onClose` · `title` · `tone` **default**·danger · `footer` · `children` | closed, open, danger | `--gradient-panel-raised`/`-dialog-danger` · `--color-magenta` · `--color-scrim-modal` · `--shadow-lg` · `--radius-4xl` · `--animate-dialog-in` |
| `Toast` | `ui/Toast.tsx` | `tone` **neutral**·earn·spend·danger · `title` · `children` · `action` · `onDismiss` | four tones, with/without action | `--color-{lime,magenta,ink-muted}` · `--color-panel` · `--shadow-md` · `--radius-2xl` · `--animate-toast-in` |
| `ToastViewport` | `ui/Toast.tsx` | `children` | — | `env(safe-area-inset-bottom)` |
| `ProgressBar` | `ui/ProgressBar.tsx` | `value` 0–100 (clamped) · `size` xs·sm·**md**·lg · `fill` **gradient**·accent · `tone` **cyan**·lime·coin·violet·magenta · `label` · `aria-label` | any value; label stays legible at 0 % and 100 % | `--gradient-progress` · accent colours · `--color-surface-3` · `--color-ink`/`-inverse` · `--radius-full/md/lg` |
| `Tabs<T>` | `ui/Tabs.tsx` | `items: {value, label, tone?, disabled?}[]` · `value` · `onChange` · `tone` **violet**·cyan·coin·lime·magenta · `size` sm·**md** · `label` | selected, unselected, hover, focus-visible, disabled | accent colours · `--color-panel` · `--color-surface-4` · `--color-ink-secondary` · `--radius-lg/xl/md` |
| `EmptyState` | `ui/EmptyState.tsx` | `icon` · `title` · `description` · `action` | with/without icon, description, action | `--color-border` (dashed) · `--color-surface-1` · `--color-ink-muted`/`-dim`/`-faint` · `--radius-3xl` · `--font-display` |
| `Skeleton` | `ui/Skeleton.tsx` | `variant` **text**·block·card · `lines` **1** | pulsing; static under `prefers-reduced-motion` | `--color-surface-3` · `--animate-skeleton` · `--aspect-card` · `--radius-sm/xl/lg` |

**Helpers, not components:** `cx()` joins class names; `toneVars()` builds a tone's custom properties; `useModal()` drives a native `<dialog>` from an `open` prop.

## Layout — `packages/web/src/components/layout/`

| Component | File | Props | States | Tokens used |
|---|---|---|---|---|
| `AppShell` | `layout/AppShell.tsx` | — (renders `<Outlet />`) | — | `--size-tabbar` · `--space-4` · `env(safe-area-inset-*)` |
| `AppHeader` | `layout/AppHeader.tsx` | `title` · `leading` · `trailing` | with/without slots | `--font-display` · `--text-4xl` · `--tracking-display` |
| `TabBar` | `layout/TabBar.tsx` | — | per-tab active accent, inactive, hover, focus-visible | `--color-chrome` · `--color-ink-faint` · accent per tab · `--size-tabbar` · `--text-2xs` |
| `StickerGrid` | `layout/grids.tsx` | `children` · `className` | 3 / 4 / 6 columns | Tailwind `md` 768px, `lg` 1024px |
| `AlbumGrid` | `layout/grids.tsx` | `children` · `className` | 2 / 3 / 4 columns | as above |

**The column counts are a spec contract** — `docs/prd/04-albums.md` §Geometry. They live in `grids.tsx` and nowhere else. Never write `grid-cols-3` for a sticker grid by hand.

## Screens

One file per screen under `packages/web/src/routes/`, wired in `routes/router.tsx`. Everything except `/dev/ui` renders inside `AppShell`, so a new screen is born in the correct frame. Tab activity is prefix-matched: `/albums/:id` keeps the Albums tab lit.

---

## Tokens at a glance

All in `packages/web/src/styles/tokens.css`. Generated from the bundle — **do not hand-edit**; if a value is wrong, fix it in Claude Design and re-run D-01.

| Family | What's there |
|---|---|
| Ground & ink | `--color-void` `-panel` `-panel-raised` `-panel-header` · `--color-ink` `-secondary` `-muted` `-dim` `-faint` `-ghost` `-overlay` `-inverse` |
| Surfaces & borders | `--color-surface-1…5` · `--color-border` `-strong` `-hairline` · `--color-check-off` `--color-cell-off` `--color-cell-idle` · `--color-scrim` `-modal` · `--color-chrome` · `--color-ring-today` |
| Accents | `--color-coin` `-light` `-deep` `-ink` `-lip` · `--color-magenta` `-light` `-lip` · `--color-cyan` `-light` · `--color-lime` `-lip` `-lip-warm` · `--color-violet` `-light` `-lip` |
| Semantic | `--color-earn` `-spend` `-danger` `-affordable` `-link` `-streak` `-today` `-missed` `-backlog` |
| Priority | `--color-prio-{high,med,low}-{row,row-border,tag,tag-border,fg}` |
| Rarity | `--color-rarity-{common,rare,epic,legendary}` + `-deep` `-ring` · `--gradient-frame-*` · `--frame-pad-*` (4→7px, widening with rarity) |
| Epic accents | `--color-epic-1…5` · `--color-epic-none` |
| Type | `--font-display` (Anton, set italic via `--font-style-display`) `-body` (Space Grotesk) `-numeric` (Chivo Mono) · `--text-3xs…7xl` · `--leading-*` · `--tracking-*` |
| Spacing & radii | `--spacing: 4px` (drives `p-3`, `gap-2`, …) · `--space-1…12` for raw CSS · `--radius-xs…4xl`, `--radius-full` |
| Elevation | `--shadow-sm/md/lg` · `--shadow-lip-{coin,lime,magenta,violet,cta}` + `-pressed` · `--shadow-coin` `-holo` `-holo-peak` `-cta-glow` `-celebration` |
| Gradients | `--gradient-holo` `-holo-text` `-coin` `-progress` `-cta` `-cta-hot` `-cool` `-cover` `-wallet` `-panel-raised` `-dialog-danger` `-locked-hatch` `-page-wash` |
| Filters | `--filter-locked` `-locked-deep` `-unlocked` |
| Motion | `--animate-*` (coin-float, reveal-flood, burst-ring, flash-bloom, pack-shake, legend-glow, banner-pop, rays, celebration-*, confetti-fall, scrim-in, sheet-in, dialog-in, toast-in, skeleton) · `--duration-*` incl. `--duration-shake-{common,rare,epic,legendary}` |
| Geometry | `--aspect-card` (5:7, sticker and cover alike) · `--size-tabbar` |

---

## Things that will otherwise be rediscovered the hard way

**`@theme static`, not `@theme`.** Tailwind tree-shakes theme variables it cannot see used, and it cannot see `var()` inside inline styles. Without `static`, every `--shadow-lip-*` and every `@keyframes` silently vanishes from the build and components render unstyled with no error.

**Token names must not double their namespace.** Tailwind derives the utility from the token name, so `--color-border-check-off` would have to be written `border-border-check-off`. Border-role colours are named for what they outline: `--color-check-off`, `--color-cell-idle`.

**`Sheet` and `Dialog` are native `<dialog>`.** `showModal()` supplies the focus trap, Escape, top-layer stacking and background `inert`. Nothing in this codebase needs a z-index to sit above a modal, and no overlay should be hand-rolled from a positioned `div`.

**`Toast` is presentational.** The queue, the timers and the undo window are T-11's. Do not grow a provider inside the component.

**Grayscale is a CSS filter over one colour master** — `--filter-locked`. There is never a second asset, and the reveal is a transition on that filter (`--animate-reveal-flood`).

**Rarity frames must read on an empty slot.** The frame is the bezel *behind* the art, so a locked or unowned sticker still announces its tier.

**Focus rings are deliberate.** The design prototype sets `outline: none` everywhere with nothing in its place; every primitive here adds a token-driven `:focus-visible` ring instead. Keep it.

**Three components were invented, not transcribed.** `Toast`, `EmptyState` and `Skeleton` do not appear anywhere in the design bundle. They follow the system's language but have had no design review — treat them as the most likely to need adjustment.
