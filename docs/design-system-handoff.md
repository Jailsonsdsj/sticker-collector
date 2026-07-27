# Getting the Design System from Claude Design into Claude Code

Target repo path: `docs/design-system-handoff.md`

Design System path: `docs/design`

This covers your second phase. Do it **after** Phase 0 of the backlog (you need a repo for the bundle to land in) and **before** Phase 2 (so no feature screen ever hardcodes a colour).

---

## The route: Export → Handoff to Claude Code

Claude Design has a purpose-built path for exactly this. From the export menu, choose **Handoff to Claude Code** (or *Send to Claude Code Web* if you're not in a terminal). <cite index="14-1">When a design is ready to build, Claude packages everything into a handoff bundle</cite>, and <cite index="17-1">that bundle contains the component structure as a machine-readable spec, the design tokens actually used on the canvas, the layout hierarchy, and the referenced assets</cite>.

This matters for your token budget: it is a spec file, not a screenshot. <cite index="17-1">Claude Code receives the bundle, loads it into context, and builds the feature.</cite> No vision-model round-trips, no "make it look like this PNG" iteration loop — which is the most expensive way to build UI with an agent.

The other exports (<cite index="13-1">.zip, PDF, PPTX, standalone HTML</cite>) are for humans. Use the handoff bundle for the build.

Two supporting facilities worth knowing:

- **The Claude Design MCP server**, if you'd rather drive design from the terminal: <cite index="11-1">`claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp`</cite>. Disconnect it after Phase 1 — see workflow doc §12.
- **`/design-sync`**, which runs the other direction. <cite index="11-1">Use `/design-sync` to pull in your design system, so everything you build in Claude Design starts from your existing components.</cite> Once `packages/web/src/components/ui/` exists, run this so any *later* design work in Claude Design starts from your real code instead of re-inventing it.

> These are current as of the Claude help centre today; the export menu changes. If you don't see "Handoff to Claude Code", check https://support.claude.com/en/articles/14604416-get-started-with-claude-design.

---

## Do not hand it over in one prompt

The tempting move is: drop the bundle in, say *"build the whole app from this design"*, walk away. It produces a demo, not a codebase — components that can't be reused, spacing that drifts by screen three, and a diff too large to review, which means it doesn't get reviewed.

Instead, the bundle enters the repo once and is then consumed by six small tasks, in strict dependency order.

### D-01 — Tokens only

Extract **only** colour, type scale, spacing, radii, shadows, and motion durations/easings into `packages/web/src/styles/tokens.css` as CSS custom properties, mirrored into Tailwind v4's `@theme` block.

No components in this task. Tokens are the contract everything else is written against, and they're the thing you least want an agent improvising later.

`tokens.css` is generated, not hand-edited. If a token is wrong, fix it in Claude Design and re-run.

#### Decisions taken during D-01

These are settled. Later tasks inherit them rather than re-deciding.

**The bundle ships two contradictory design systems. Only one is ours.** `docs/design/project/_ds/classical-…/` is a light editorial theme (near-white ground, Cormorant Garamond over Lora, one muted gold accent) that the design tool attaches by default. `docs/design/project/Sticker Collector Design System.dc.html` is the real thing: ink-dark `#0c0a13` ground, Anton / Space Grotesk / Chivo Mono, neon magenta-cyan-lime-violet, arcade buttons with a hard drop-shadow lip. **Tokenise the `.dc.html`; ignore `_ds/`.** Its `_adherence.oxlintrc.json` whitelists only the Classical tokens and fonts, so it cannot be reused as D-06's guard — `scripts/check-tokens.sh` is the guard.

**Fonts are self-hosted, not CDN.** Anton, Space Grotesk and Chivo Mono come from `@fontsource` packages imported in `styles/app.css`, not the prototype's `fonts.googleapis.com` link. A third-party font request would break the offline shell H-02 promises and add a blocking round-trip to every cold start. Anton ships no italic cut — the display style is the browser's synthesised oblique, as in the prototype, exposed as `--font-style-display`.

**The reveal holds longer as rarity rises, on a four-step scale.** The prototype specifies only the endpoints — 560 ms for every non-legendary tier, 1000 ms for legendary. The two middle steps are interpolated: `--duration-shake-common/rare/epic/legendary` = 560 / 680 / 820 / 1000 ms. Marked DERIVED in `tokens.css`; retune there and nothing else changes.

**`@theme static`, not `@theme`.** Tailwind tree-shakes theme variables it cannot see being used, and it cannot see `var()` inside inline styles or raw CSS. Without `static`, every `--shadow-lip-*`, `--radius-4xl` and `@keyframes` silently vanished from the build. `tokens.css` is a published contract, so it publishes whole.

**Token names never double their namespace.** Tailwind derives a utility from the token name, so `--color-border-check-off` would have to be written `border-border-check-off`. Border-role colours are therefore named for what they outline (`--color-check-off`, `--color-cell-idle`, `--color-cell-off`), not prefixed with `border-`. Getting this wrong is silent: the class simply doesn't exist and the element renders unstyled.

**Spacing, type and radii are snapped to scales.** The prototype is a mock-up and uses ad-hoc literals (gaps of 3–40 px, radii of 2–22 px, seventeen distinct font sizes). Spacing is on a 4 px grid; type and radii collapse to monotonic ladders. Every such call is marked DERIVED in `tokens.css` with its reasoning. Values lifted verbatim carry no marker.

#### Amended during D-02

Building the primitives surfaced eight colours the bundle uses but D-01 missed — `#b6acce` alone appears 24 times. Added to `tokens.css`: `--color-ink-secondary` (inactive chips, segmented-control off state, body copy), `--color-ink-ghost` (unscheduled weekly cell), `--color-ink-overlay` and `--color-scrim` (text on artwork), `--color-surface-5`, `--color-check-off`, `--color-cell-off`, `--color-cell-idle`, `--color-ring-today`.

The remaining untokenised hexes in the bundle are one-off gradient stops inside screens — album covers, wizard panels, the sticker modal. They belong to D-04 and the feature tasks, not to the token sheet.

#### Amended during D-03

Three of batch 2 — `Toast`, `EmptyState`, `Skeleton` — **do not exist anywhere in the bundle.** No toast, no empty state, no loading placeholder, and nothing for the undo window T-11 needs. They were derived from the system's own language and are marked DERIVED in their source. They are the components most worth a second look, because they were invented rather than transcribed.

Overlay motion was also unspecified, so `--animate-scrim-in`, `--animate-sheet-in`, `--animate-dialog-in`, `--animate-toast-in` and `--animate-skeleton` were added to `tokens.css` with matching `--duration-*` values, alongside `--color-scrim-modal` and `--gradient-dialog-danger` lifted from the delete confirm.

**`Sheet` and `Dialog` sit on a native `<dialog>`.** `showModal()` provides the focus trap, Escape-to-close, top-layer stacking and background `inert` — all of which the prototype improvises with a z-index ladder (40/45/46/48/100) and none of which it actually implements. Nothing in this codebase should need a z-index to sit above a modal.

### D-02 / D-03 — Primitives, in two batches

Batch 1: `Button`, `Input`, `Textarea`, `Chip`, `Checkbox`, `Badge`.
Batch 2: `Sheet`, `Dialog`, `Toast`, `ProgressBar`, `Tabs`, `EmptyState`, `Skeleton`.

Two batches rather than one because a thirteen-component diff is not reviewable and a six-component one is. Each component takes tokens as its only styling input — zero literal values.

### D-04 — App shell

Tab bar, header, routing skeleton, iOS safe-area insets, and the responsive breakpoints the spec fixes: **3/4/6 sticker columns** and **2/3/4 album columns** at iPhone / iPad / desktop.

Do this before any screen exists, so every screen is born inside the correct frame.

### D-05 — The index (the important one)

Two outputs:

**A `/dev/ui` route** — a kitchen-sink page rendering every component in every state. Not Storybook: Storybook is six dependencies, a build config, and a story file per component that will rot. A single route is one file, ships with the app, works on a real iPhone, and costs the agent nothing to read.

**`docs/design-system.md`** — a component inventory table:

| Component | File | Props | States | Tokens used |
|---|---|---|---|---|
| `Button` | `ui/Button.tsx` | `variant`, `size`, `loading`, `disabled` | default, hover, active, disabled, loading | `--color-accent`, `--radius-md`, `--space-3` |
| … | | | | |

**This file is the point of the whole phase.** After D-05, every UI task in Phases 2–6 reads a ~60-line inventory instead of the design bundle. The bundle gets read once, by six tasks; the inventory gets read forty times, cheaply. Build the index, then read the index.

### D-06 — The guard

A CI check that fails the build on any hex, `rgb()`, or hardcoded font-size outside `tokens.css`.

Without this, drift is guaranteed. Not from carelessness — an agent implementing the album grid at 11pm on a Tuesday has no memory of `--color-surface-raised` unless something forces it to look. `D-06` is that something, and it costs one grep in CI.

---

## Sticker-Collector-specific notes for the design pass

Things worth confirming exist in your design system before D-02, because they're load-bearing in the spec and awkward to retrofit:

- **Grayscale is a filter, not a variant.** Locked stickers and covers must be the *same* component with `filter: grayscale(1)`, so the reveal animation is a transition on that filter. If the design system has separate locked/unlocked components, merge them now.
- **Four rarity frames** — plain → increasingly ornate. They must be visible on an **empty** slot, per spec. This is a border/overlay treatment on the placeholder, not something layered on an image.
- **Priority tint × epic accent must coexist.** Priority is the row background; the epic accent is a left border or dot. Check they're legible together at all three priority levels.
- **The coin ticker** needs a token for its animation duration, and the reveal needs four (one per tier, held longer as rarity rises).
- **5:7 aspect ratio** is fixed everywhere. Sticker and cover are the same shape; the cover is exactly 3×. Any component that displays either should enforce the ratio in CSS, not trust the image.
- **The weekly grid** — seven columns of checkboxes on a phone. Worth designing explicitly; it's the one screen where the spec's tap-count promise ("five taps, not five forms") can be quietly broken by layout.

**Checked during D-01, against the `.dc.html`:**

| Item | Status |
|---|---|
| Grayscale as a filter | ✅ `--filter-locked` / `--filter-unlocked`, one master, `reveal-flood` transitions between them |
| Four rarity frames | ✅ `--gradient-frame-*` + `--frame-pad-*` (4→7 px, widening with rarity) and `--color-rarity-*` identity dots. The frame is the bezel *behind* the art, so an empty slot still reads its tier |
| Priority tint × epic accent | ✅ separate token sets — `--color-prio-*-row` for the row, `--color-epic-1…5` for the 3 px left border |
| Coin ticker + four reveal durations | ✅ `--duration-coin-float`; the four-step shake scale is above |
| 5:7 ratio | ✅ `--aspect-card`, giving Tailwind's `aspect-card` |
| Weekly grid | ✅ designed in full — `grid-template-columns: 80px repeat(7, 1fr)`, 28 px cells, today's column tinted cyan, unscheduled days rendered as faint dots. T-12 has a handoff to build against; the layout itself lands in T-12, not here |

---

## Sequencing with the rest of the build

```
F-01 … F-08          Phase 0 — repo exists, deployed, authenticated
      ↓
   [export handoff bundle from Claude Design → design/]
      ↓
D-01 tokens → D-02/D-03 primitives → D-04 shell → D-05 index → D-06 guard
      ↓
   [run /design-sync so later design work starts from real components]
   [disconnect the Claude Design MCP server]
      ↓
T-08 … onward       every screen built against docs/design-system.md
```

One phase, six sessions, roughly a day. What it buys you is that the remaining forty tasks never make a visual decision — which is both why the app will look coherent and why those tasks are cheap.
