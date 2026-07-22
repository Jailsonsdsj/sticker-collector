# Getting the Design System from Claude Design into Claude Code

Target repo path: `docs/design-system-handoff.md`

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
