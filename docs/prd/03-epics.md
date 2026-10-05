## Epics

- Each epic represents a group of related tasks.
- The epics page must support CRUD of epics.
- When creating a new epic, the user enters the title and then adds tasks to that epic.
- When deleting an epic, the user must be asked whether to delete its tasks or simply leave them unlinked.
- The epics screen lists the epics.
- Clicking an epic lists the tasks inside it, alongside a button to add new tasks.
- The new-task form opened from an epic is the same form used for independently created tasks (on another tab).
- When creating a task inside an epic, the epic label must arrive pre-filled with that epic.

**Enhancements (MVP)**

- **Epic progress.** Each epic shows a small ratio of done to total among its one-off tasks — a project's completion at a glance. Routines are excluded, since they never "finish."
- **Epic as a coin goal.** An epic may name a target: *"finish this epic to afford the Travel album."* The link is informational, a way to tie a burst of work to a specific reward.
- **Three sections.** The screen groups epics into **Active progress**, **Next steps** and **Achievements**, using the same collapsible headings the Tasks tab uses, each with a count and a **＋** that starts a new epic *in that section* — the section is the decision, so it should not have to be made twice. The status is **stored, not derived from the ratio**: an epic at 100% may still be running, and one at 40% may be as finished as it is ever going to be. Every existing epic is `active`, and Achievements starts folded — it is a record, not a queue, and a year of finished work above the fold buries what is running today.
- **Three types: Construction, Maintaining, Fundamental.** An epic's type says how much of the week it should get, and sets the priority a **new** task in it starts at: **Construction** [C] — work being built, active and dynamic — starts **high**; **Maintaining** [M] — kept running in the routine, without the strategy or effort building takes — starts **medium**; **Fundamental** [F] — the base, at the bottom of the priority order — starts **low**. It is chosen with a select in the epic form, and shown in the list as its initial in a tag beside the epic's task count (`C` `1/4`), coloured like the priority it sets. It is **only a default**: the task form starts at it, follows it when another epic is picked, and stops following the moment the user picks a priority; editing an existing task never changes its priority. A task with no epic starts at medium. Existing epics are Maintaining, whose medium is what every new task started at before types — so adding them changed nothing until someone chose otherwise.
- **Optional description.** An epic may carry free text (up to 2000 characters) saying what it is for. Shown under the title on the card — clamped to two lines while collapsed, in full once the epic is open, so a long one cannot push the other epics off the screen.
- **Ticking a task from inside the epic.** An expanded epic lists its tasks; a **one-off** is tickable in place, through the same three-second undo queue as the home screen, and clicking any task's title opens the same task form for editing. **Routines get no checkbox here.** A routine belongs to a day — the API refuses a completion on a date the schedule does not cover — so a checkbox in a list with no notion of a day would promise a tick that comes back `400` on most days. A routine is ticked on the task list, or from its block on the Week tab's agenda.
- **Fifteen accents.** The palette is `epic-1` … `epic-15`. `EPIC_ACCENTS` in `packages/shared` is the single list; the schema, the form's swatches and the progress-bar tone map all derive from it. The last ten live in `tokens.css` by hand — see backlog `TD-32`.
- **Colour or icon per epic.** A single accent, inherited by the epic's tasks in list views, so the eye groups them without reading. This coexists with the priority tint: priority is the background, the epic accent is a left border or dot.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*
