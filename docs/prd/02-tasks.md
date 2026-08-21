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

0. **A routine is never scheduled before the day it was created.** Adding a
   Mon–Sun routine on Thursday must not mark that week's Monday, Tuesday and
   Wednesday as missed — the task did not exist then. An explicit `startsOn` in
   the future still wins; one in the past is clamped, because backdating a
   routine cannot retroactively create days you failed to do it on.
1. An occurrence not completed by end of day becomes **missed**. It leaves the Today list and, from the home screen, leaves altogether: missed days are read and ticked on the Week tab. The status itself is unchanged — it is still derived, still completable, and still what the reports count.
2. A missed occurrence remains completable and pays its snapshotted reward in full.
3. After **seven days** a missed occurrence is **archived**: no longer completable, still counted in reports.
4. A dated one-off does not archive. It persists until completed or deleted.
5. When a missed occurrence is completed late, the occurrence keeps its original scheduled date and coin snapshot, while the ledger entry carries the real completion timestamp. Reports must never claim work happened on a day it did not.

**When a routine runs — slots** *(W8-01; the agenda that reads them is W8-03)*

- A routine may carry **one time slot per weekday**: a start and an end, as **wall-clock minutes from midnight**. Not an instant — 18:00 means 18:00 wherever the user is, and a stored timestamp would move every block when the profile's timezone changed.
- **The weekday mask stays authoritative.** A slot says *when* a routine happens on a day the mask already includes; it never adds a day. A slot on a day outside the mask is refused, because two sources of truth for "does this run on Tuesday" would let the agenda and the home screen disagree about one task.
- **One slot per weekday**, enforced by the schema and by a unique index. `occurrence` is unique on (task, date) and the coin ledger hangs off that pair, so a second block on the same day would be a completion the database cannot record.
- **Overnight is refused, not split.** 22:00 → 01:00 is two blocks on two days; inventing the second would put the task on a day the user never chose.
- Slots are **optional**: every routine that predates this has none, and the agenda simply does not show it.
- **Overlaps are refused.** Two routines in one slot cannot both be drawn: the agenda puts them in the same cell and the second covers the first, so one task disappears from the day it was scheduled on. This began as a *warning* — "two things at nine on a Monday is a mess a person may knowingly want" — and the warning was wrong, because what it permitted was not a visible mess but an invisible task. The form disables Save and names the clash; the Worker answers **409** on create and on patch, and refuses *before* it writes, since D1 has no transaction to undo a half-applied change with. Back-to-back is not an overlap: slots are half-open, so 09:00–10:00 and 10:00–11:00 sit together happily.
- **Refusing a new clash does not undo an old one.** Slots saved before the rule can still collide, so the agenda lays overlapping blocks **side by side** within their day rather than on top of each other — a task you cannot see is a task you cannot fix.

**The home screen**

Six sections, in this order:

0. **In progress** — anything with a `startedAt`. A routine contributes **only today's occurrence**: `startedAt` belongs to the task and a routine is one row per day, so listing every one of them put the same title on screen five times. Its other days keep their own meaning (tomorrow is still backlog, and a day already gone is the Week tab's), and a started routine that is not scheduled today shows nothing here — there would be no day to tick. A one-off is a single row, so it appears here whatever date it carries. Unlike a pin, this is an **instant and it does not expire**: a pin is a claim about *today* and is worthless tomorrow, while starting something is a claim about the task, and putting a half-finished job back in the general pile every morning is exactly what marking it started is for. It outranks every section but *Completed today*.
1. **For today** — today's routine occurrences, plus any capture pinned to
   today. **Only an undated one-off can be pinned**: a fresh completion is
   validated against the schedule, and the undated one-off is its single
   exception, so pinning anything else would put a row in today's list that the
   API then refuses to tick. The pin is a **date**, not a boolean, so it expires
   by itself — pinned yesterday is not pinned today.
2. **Missed** — a one-off whose **due date has gone**. Judged on `dueAt`, never on a leftover occurrence: unticking leaves a pending row behind, and an *undated* capture has no deadline to have missed. Most overdue first — the one that slipped furthest is the one most likely to have been forgotten.
3. **General** — every other one-off, dated or not. A due date still in the
   future does not move a one-off out of here; it is a thing you capture once
   and do once.
4. **Completed today** — anything finished today, whatever day it was scheduled
   for. A routine missed on Monday and ticked on Thursday belongs here, because
   the section is a record of today's effort rather than of today's schedule.
5. **Routine backlog** — routine occurrences scheduled ahead.

**In progress, For today, General and Completed today open by default; Missed
and the routine backlog start folded.** Both are reference rather than work in
hand — what already slipped, and a fortnight that has not happened — and either
one open pushes today's actual list off the first screenful. The
choice is remembered per device, and only for sections the user has actually
toggled, so a default can be changed later and still reach anyone who never
expressed a preference.

**Within a section, the order is priority first — high, medium, low — with the
title breaking ties** so the list is stable between renders. Priority already
tints the row; sorting by it is what makes the tint worth having. The two dated
sections keep the **day** as the primary key and order by priority *within* a
day: a missed Tuesday and a missed Thursday are different days, not one item at
two urgencies. *Completed today* stays alphabetical — it is a record, and
nothing in it needs doing.

**A routine's gone days are not on this screen.** A routine leaves one open
occurrence per day it was not ticked, so a handful of daily habits filled the
home screen with a week of history that grew every morning — reference material,
on the screen whose job is what is left today. Those days are still completable,
on the **Week tab**, where a week is the unit and ticking a past box is the whole
point. *Missed* therefore holds overdue **captures** only: there is exactly one
of each, it will not reappear tomorrow, and it is the thing most likely to have
been forgotten.

**An item appears in exactly one section**, decided by precedence: completed
today wins over everything, then in progress, then for-today, then missed, then
general, then the backlog. Without that rule a one-off pinned to today qualifies for two sections
and renders twice.

**One way in.** The screen has a search field and a **New task** button; the
one-line quick-add above it is gone. It created an undated one-off at the
default effort — the same thing the form produces, minus the section and the
priority the capture box could not ask for — and two doors to one room meant the
smaller one could not say where the task landed. The form opens with **General**
selected (capture is the common case) and both **effort and reward filled at 30**:
a coin is a minute, and an empty reward box under a filled effort box reads as a
decision still to make. The reward keeps mirroring the effort until it is typed
over, and only then is it *sent* — otherwise the server inherits it.

**A search field sits above the button.** It filters every section by title as
it is typed, with nothing to submit, and opens the folded sections while a query
is active so a match cannot hide in one.

**Swiping a row moves it between the two lists work actually passes through:**
right starts it (into *In progress*), left brings it into *For today* — and
stops it, because a task cannot be both underway and merely planned. Both
directions commit at once and each undoes the other, which is why neither asks.
**Delete is not on the row any more**: it was the one gesture here that a stray
touch could trigger and the user could not undo, and it lives in the task view,
where it still asks first. Only an undated one-off can be *pinned*, so a left
swipe on anything else only stops it; when there is nothing to stop either, the
row says why rather than doing nothing.

Completing anything moves it to *Completed today* immediately, and undoing
inside the undo window moves it back. "For today" therefore counts what is
left, not what was scheduled.

**The weekly grid**

Routine maintenance does not happen through the task form. It happens on a single screen: tasks as rows, the seven weekdays as columns, a checkbox in every cell. The user sees the whole week at once and toggles cells. Creating a Mon–Fri habit is five taps, not five forms.

The screen has three views: **Agenda**, **Tick off** and **Schedule**. Each row wears its epic's accent on its leading edge, the same colour the home screen gives it, and titles wrap rather than truncate: the label column is narrow, and a cut-off title routinely hid the word that told two routines apart.

**Agenda is the default** — "what am I meant to be doing now" is the question this tab is opened with, day to day. *Tick off* is the checkbox week, and it stays: the agenda can only show a routine that has hours, and every routine created before slots existed has none, so removing it would strand them. *Schedule* is where five taps make a Mon–Fri habit; that flow is now six taps, one to reach it.

**The agenda** *(W8-03)*

- Hours down the side, days across the top, each routine a named **block** in the slot it runs in — a name, not a checkbox, because "is it done" is a smaller question than "what is it".
- The hour column is **derived** from the earliest start and the latest end, rounded outwards to whole hours. A person whose day starts at six does not scroll past six empty rows to reach it.
- **Only routines with times appear.** A block with no hour has nowhere to go, so a week with no slots shows an empty state saying exactly that, not an empty grid.
- **Two layouts, not one scaled down.** Seven columns on a 390px phone is ~50px each, so below `40rem` the agenda shows **one day at a time** with a day picker for the rest of the week. Without the picker a phone would see today and nothing else — including no way to tick off a day already gone, which is half the reason the Week tab exists.
- The grid **opens scrolled** to now, or to the day's first block when the shown day is not today. Fifteen rows holding three blocks is otherwise a page of empty morning.
- **Now** is a line drawn inside its own hour row (rows are content-sized, so a fraction of the whole grid drifts), and the block containing it carries a ring. Both move on a minute tick — the one thing on this screen that is wrong the moment it stops moving.
- Tapping a block completes that day through the **same undo queue** as everywhere else, and a completed block gets a wash of the coin colour plus a struck-through title. A wash, not a fill: the name has to stay readable, which is the whole point of showing names.
- A block on a **day that has not arrived** is inert, for as long as `canComplete` refuses the future (W8-05).

The daily list is never assembled by hand. The home screen shows today's occurrences, today's dated tasks, and anything overdue.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*

**Finishing a task**

The tick plays a short flourish on the row itself and the coins climb in the
wallet. There is **no popup**: the undo toast used to cover the tab bar after
every single tick, and ticking several things in a row is the normal case.

The three-second window is unchanged, and so is its guarantee — undoing inside
it means **no ledger row ever existed**. It simply stops advertising itself:
unticking the row cancels it. The flourish is what tells you the tick landed,
because a row that merely greys out is indistinguishable from one that failed to
save.
