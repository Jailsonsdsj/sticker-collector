## Reports and metrics

Reports optimise for **momentum** — consistency and habit strength — not for economic analysis. The question they answer is *am I keeping this up*, not *how are my coins allocated*.

Everything below derives from data the app already stores: the occurrence log, each occurrence's completion timestamp, and the coin ledger. No new tracking is required.

**Streaks**

- **Per-routine streak** — consecutive scheduled days a routine was completed. A day the routine was not scheduled does not break it; a scheduled day missed does. This is the headline number on each routine.
- **Longest streak** kept alongside the current one, so a broken streak leaves a record worth rebuilding toward rather than simply resetting to zero.
- **Perfect days** — days on which every scheduled occurrence was completed. Counted, and shown as a current run.

**Consistency**

- **The daily review.** The first visit of each day opens a modal listing what was finished **yesterday**: title, epic, and the coins it paid. Tapping any day on the consistency calendar reopens the same view for that day. It shows once per day and **never opens empty** — a modal saying "you finished nothing yesterday" is a punishment, and this app's economy is built the other way round. It lists what was **ticked on** that day, whatever run it belonged to: a Monday routine ticked on Wednesday is in Wednesday's review. The list itself stores nothing — the occurrence carries the coins it paid (frozen at completion) and the task carries its title and epic.
- **The day's grade** is the share of the day's time that got done: minutes done over minutes the day held. A day holds its scheduled runs (routines on their weekdays, one-offs on their due date) **plus everything else finished in it** — a late routine run, an undated one-off, a one-off done off its due date — each counted as both held and done. A scheduled run not ticked that day is a miss on that day, even if it is ticked later; the later tick is work on the later day. A one-off done before its due date is not also a miss on the due date. A day with nothing in it has no grade, never 0.
- **Grades are frozen.** A day's grade is evidence of whether things are improving, so once the day has closed it is stored (`day_score`, append-only by trigger) and never recomputed: editing a routine's weekdays or effort, or deleting it, changes today and the future only. The momentum report stores each closed day the first time it reads it; today stays live. A backup carries the stored grades, so a restore does not recompute the past from the routines as they are now.
- **The consistency calendar** — a real month grid, one cell per day, shaded by the proportion of that day's occurrences completed and paged a month at a time — by swipe or by the arrows — from today back through the year of history. The single most motivating view a habit app owns; it makes a gap physically visible. It was a year of anonymous dots, which showed the shape of a gap but not *which days* — "I dropped off around the 20th" is the thought it has to answer, and that needs dates on the cells. The shading keeps two states at the bottom: a scheduled day missed is not the same as a day with nothing scheduled, and a day outside the reported window claims neither.
- **The weekly report.** Each week's **R** cell on the calendar opens that week's report, from **Sunday at 22:00** (the user's time) on — before then the cell is a score and nothing more, because the report does not exist yet. The report is a grid of the week's routines, Monday first, every scheduled day marked **done** (on its own day), **done late** (ticked on a later day that week), or **missed**, with days the routine does not run left blank; below it, **every other task done that week** with its day and the coins it paid. It counts only what was ticked **before Sunday 22:00**. There is no scheduler: the report is built the first time it is opened after that moment, and because it ignores every later tick it says exactly what a job at 22:00 would have said. Once built it is **frozen** (`week_report`, append-only by trigger), names and epic colours included — a routine edited, renamed or deleted afterwards does not change a week that has been reported. A backup carries the reports.
- **Completion rate** over the trailing 7, 30, and 90 days — occurrences done over occurrences scheduled. Trailing, not all-time, so recent effort is not drowned by ancient history.
- **Weekday shape** — completion rate broken out by day of week, which surfaces the honest pattern (*Mondays hold, Fridays collapse*).

**Effort**

- **Minutes invested** per week and per month, from completion timestamps. Because a coin is a minute, this doubles as coins earned — the two are the same axis.
- **Effort by epic** — where the time actually went, which is often not where it was intended to go.

**Collection**

Momentum-framed, not economic:

- **Stickers earned** over time — the collection growing, plotted against effort. The clearest picture of work becoming reward.
- **Albums completed**, as a simple count and a shelf of finished covers.

**Explicitly out of scope for v1**

Coin-allocation breakdowns, album ROI, spend-efficiency, luck analysis of random pulls. They are economic, not motivational, and the wallet plus ledger already make them computable later without new data.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*
