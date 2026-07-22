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
- **Colour or icon per epic.** A single accent, inherited by the epic's tasks in list views, so the eye groups them without reading. This coexists with the priority tint: priority is the background, the epic accent is a left border or dot.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*
