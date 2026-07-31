## Tasks

A task must have:

1. Title (required)
2. Description (text)
3. URL field (text)
4. Execution time in minutes (effort), which is reflected in coins (number)
5. Epic label (text)
6. **Type** — routine or one-off. A routine repeats on a set of weekdays; a one-off happens once.
7. **Priority** — low, medium, or high. Each level is shown as a text label *and* a slight tint of the task's background color. The label carries the meaning; the color reinforces it.
8. **Due date (optional, one-off only)** — a date and a time.
9. Reward (defaults to the same value as the effort time, unless the user changes it)
10. See *Enhancements* below.

Priority does not affect the reward. It exists for sorting, filtering, and visual scanning only.

**Enhancements (MVP)**

- **Quick-add.** A single text field on the home screen that creates a one-off with a default effort and no epic. Full form is one tap away. Capture must never cost a form.
- **Confirm-on-complete.** Checking a task plays a brief coin animation and shows the balance ticking up. The reward must be *felt*, or the loop is just a checkbox.
- **Undo.** Completing is reversible for a few seconds — a misclick must not silently pay coins. After the window closes it becomes a ledger entry and can only be corrected by re-opening the occurrence.
- **Effort presets.** The effort field offers 15 / 30 / 60 / 90 as chips. Fewer keystrokes, and it nudges honest estimates over round guesses.

**CRUD**

1. Must support the standard CRUD operations found in every application.
2. Tasks can be created either from the main menu or from within their respective epic.
3. If created from the epics page, the task must arrive with the epic label already filled in.
4. If created from the main button, all fields must arrive blank.
5. It must be possible to select multiple tasks and then duplicate or delete them.
6. See *Enhancements* below.

**Scheduling**

Every task is either a **routine** or a **one-off**. The choice is made at creation.

| Type    | Scheduling          | Where it appears      |
| ------- | ------------------- | --------------------- |
| Routine | a set of weekdays   | on every matching day |
| One-off | a due date and time | on its due date       |
| One-off | no date             | backlog only          |

**Recurrence**

1. Recurrence is expressed as **seven booleans** — one per weekday — plus an optional start and end date. Nothing more. Task A is Mon–Fri; task B is Sat; task C is Sat and Sun. Do not implement RFC 5545 / `RRULE`; the product does not need it.
2. A routine is a **definition**, not a list of rows. It generates an **occurrence** for each matching day. Occurrences are materialized lazily, only for the window being viewed. The future is never written to the database.
3. An occurrence carries: its scheduled date, its status (pending, done, missed, archived), its completion timestamp, and **a snapshot of the coins it paid.**
4. The snapshot matters. Editing a task's reward changes future occurrences only. History is never rewritten, and the coin ledger always reconciles.
5. Deleting a routine stops it generating. Past occurrences, and the coins they paid, survive in the ledger.
6. **An occurrence cannot be completed before its scheduled date.** Ticking next month's tasks today would mint coins for work that has not happened.

**Missed work**

1. An occurrence not completed by end of day becomes **missed**. It leaves the Today list and moves to a separate section.
2. A missed occurrence remains completable and pays its snapshotted reward in full.
3. After **seven days** a missed occurrence is **archived**: no longer completable, still counted in reports.
4. A dated one-off does not archive. It persists until completed or deleted.
5. When a missed occurrence is completed late, the occurrence keeps its original scheduled date and coin snapshot, while the ledger entry carries the real completion timestamp. Reports must never claim work happened on a day it did not.

**The home screen**

Five sections, in this order:

1. **For today** — today's routine occurrences, plus any capture pinned to
   today. **Only an undated one-off can be pinned**: a fresh completion is
   validated against the schedule, and the undated one-off is its single
   exception, so pinning anything else would put a row in today's list that the
   API then refuses to tick. The pin is a **date**, not a boolean, so it expires
   by itself — pinned yesterday is not pinned today.
2. **General** — every one-off, dated or not. A due date does not move a one-off
   out of here; it is still a thing you capture once and do once.
3. **Missed** — routine occurrences from earlier days, still open.
4. **Completed today** — anything finished today, whatever day it was scheduled
   for. A routine missed on Monday and ticked on Thursday belongs here, because
   the section is a record of today's effort rather than of today's schedule.
5. **Routine backlog** — routine occurrences scheduled ahead.

**For today, General and Completed today open by default; Missed and the
routine backlog start folded.** The two folded ones are reference rather than
work in hand — what already slipped, and a fortnight that has not happened —
and either one open pushes today's actual list off the first screenful. The
choice is remembered per device, and only for sections the user has actually
toggled, so a default can be changed later and still reach anyone who never
expressed a preference.

**An item appears in exactly one section**, decided by precedence: completed
today wins over everything, then for-today, then missed, then general, then the
backlog. Without that rule a one-off pinned to today qualifies for two sections
and renders twice.

Completing anything moves it to *Completed today* immediately, and undoing
inside the undo window moves it back. "For today" therefore counts what is
left, not what was scheduled.

**The weekly grid**

Routine maintenance does not happen through the task form. It happens on a single screen: tasks as rows, the seven weekdays as columns, a checkbox in every cell. The user sees the whole week at once and toggles cells. Creating a Mon–Fri habit is five taps, not five forms.

The daily list is never assembled by hand. The home screen shows today's occurrences, today's dated tasks, and anything overdue.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*
