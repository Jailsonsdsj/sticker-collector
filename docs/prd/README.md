# Sticker Collector

> Working title (pt-BR): *Colecionador de Figurinhas* Status: **Draft — in refinement.** Sections marked `[TODO]` are open.

**Sticker Collector** is a to-do list where completing tasks earns coins, and coins buy albums and stickers. It employs a productivity gamification strategy: boosting daily and long-term task completion while offering the fun of collecting digital stickers earned through effort.

Users create their own albums and stickers. They also set the unlock cost of each sticker and album, and the coin reward for each task. Completing an album unlocks its print export.

The product ships as a single installable Progressive Web App, running on iPhone, iPad, and any desktop browser, and installed to the home screen on iOS devices. It requires no Apple Developer account, no App Store submission, and no native build. The application is for personal use.

------

> **This document has been split for agent context efficiency.** Load only the
> section a task needs — see the `Load` column in [`docs/backlog.md`](../backlog.md).
> Nothing was rewritten; these are verbatim slices of the original document.

## Index

| File | Covers |
|---|---|
| [`00-flow.md`](./00-flow.md) | The two loops, the shared currency, the product thesis |
| [`01-coins.md`](./01-coins.md) | Earning, spending, returning, display rules |
| [`02-tasks.md`](./02-tasks.md) | Task fields, CRUD, scheduling, recurrence, missed work, home screen, weekly grid |
| [`03-epics.md`](./03-epics.md) | Epic CRUD, epic progress, coin goals, accents |
| [`04-albums.md`](./04-albums.md) | Album states, creation, sealing, geometry, the album economy, deletion |
| [`05-stickers.md`](./05-stickers.md) | Acquisition, duplicates, rarity, random purchase rules |
| [`06-export.md`](./06-export.md) | The print PDF |
| [`07-services.md`](./07-services.md) | Identity, data, backup, hosting stack |
| [`08-reports.md`](./08-reports.md) | Streaks, consistency, effort, collection |
| [`09-data-model.md`](./09-data-model.md) | Schema, invariants, notes for the build |

Implementation decisions that supersede or extend this spec live in
[`docs/architecture.md`](../architecture.md) — in particular §0, which corrects
three items in `07-services.md` and `02-tasks.md`.

---

## Design

1. Design will be done later, after this document is complete.

## Development

1. When the development phase is reached, an agent will be used as a coding assistant: Claude Code in VS Code.

------

# Status

Refinement complete. Flow, all feature specs, per-feature enhancements, reports, services, and the data model are written; no open decisions remain. Ready to hand to design and development.

Design complete.

# Tasks after go live (optional)

Strong sticker buying animation

Strong album buying animation

Strong album complete animation

print and export preview

settings and backup

onboarding

export the system as pdf
