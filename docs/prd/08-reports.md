## Reports and metrics

Reports optimise for **momentum** — consistency and habit strength — not for economic analysis. The question they answer is *am I keeping this up*, not *how are my coins allocated*.

Everything below derives from data the app already stores: the occurrence log, each occurrence's completion timestamp, and the coin ledger. No new tracking is required.

**Streaks**

- **Per-routine streak** — consecutive scheduled days a routine was completed. A day the routine was not scheduled does not break it; a scheduled day missed does. This is the headline number on each routine.
- **Longest streak** kept alongside the current one, so a broken streak leaves a record worth rebuilding toward rather than simply resetting to zero.
- **Perfect days** — days on which every scheduled occurrence was completed. Counted, and shown as a current run.

**Consistency**

- **The heatmap** — a calendar year, one cell per day, shaded by proportion of that day's occurrences completed. The single most motivating view a habit app owns; it makes a gap physically visible.
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
