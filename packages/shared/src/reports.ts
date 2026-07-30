import {
  addDays,
  compareDates,
  type LocalDate,
  occurrencesInWindow,
  type Schedule,
  toDayNumber,
  WEEKDAYS,
  type Weekday,
  weekdayOf,
} from "./recurrence.js";

/**
 * Momentum, computed from what the app already stores.
 *
 * Reports answer *am I keeping this up*, not *where did my coins go*
 * (`prd/08-reports.md`). Everything here derives from three things: the
 * schedule, the days a completion row exists, and the user's timezone.
 *
 * The scheduled days are **derived**, never read from a table — an occurrence
 * row exists only once something has been completed or archived, so "was this
 * day scheduled?" is a question only the weekday mask can answer.
 *
 * **Weekday indexes are Monday-first**, matching the mask (bit 0 = Monday) and
 * the weekly grid. A Sunday-first assumption here produces a histogram that is
 * silently rotated by one day and looks entirely plausible.
 */

/** A routine or one-off, with just enough of it to schedule. */
export interface ReportTask {
  id: string;
  title: string;
  schedule: Schedule;
}

/** The days a task was completed. Order does not matter. */
export type CompletionsByTask = ReadonlyMap<string, ReadonlySet<LocalDate>>;

export interface ReportInput {
  tasks: readonly ReportTask[];
  completions: CompletionsByTask;
  /** The user's today, in their own calendar. */
  today: LocalDate;
}

/**
 * How far back any history walk may go.
 *
 * The same ceiling `materialiseWindow` uses, and for the same reason: a Worker
 * has 10 ms of CPU, and an unbounded walk over a routine created three years
 * ago is how this becomes a timeout nobody can reproduce locally.
 */
export const MAX_HISTORY_DAYS = 366;

export interface StreakReport {
  taskId: string;
  title: string;
  /** Consecutive scheduled days completed, counting back from today. */
  current: number;
  /** The best run in the last year — a record worth rebuilding toward. */
  longest: number;
  /** The most recent day this routine was completed, if ever. */
  lastCompletedOn: LocalDate | null;
}

/**
 * Per-routine streaks.
 *
 * A day the routine was not scheduled **does not break** the streak; a
 * scheduled day missed does. That is the whole rule, and it is why the walk
 * steps over the schedule rather than over the calendar.
 *
 * Today is never a breaker. A routine scheduled today and not yet done is still
 * open — treating it as a miss would make every streak read zero until evening.
 */
export function streakFor(
  task: ReportTask,
  done: ReadonlySet<LocalDate>,
  today: LocalDate,
): StreakReport {
  const from = addDays(today, -(MAX_HISTORY_DAYS - 1));
  const scheduled = occurrencesInWindow(task.schedule, from, today);

  let current = 0;
  let longest = 0;
  let run = 0;

  for (const day of scheduled) {
    if (done.has(day)) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (day === today) {
      // Still open. It neither extends nor breaks anything.
    } else {
      run = 0;
    }
  }

  // `run` is the streak still in progress at the end of the window, which is
  // exactly the current streak: any break would have reset it.
  current = run;

  const completed = [...done].filter((day) => compareDates(day, today) <= 0).sort(compareDates);

  return {
    taskId: task.id,
    title: task.title,
    current,
    longest,
    lastCompletedOn: completed.at(-1) ?? null,
  };
}

export interface DayTally {
  date: LocalDate;
  scheduled: number;
  done: number;
}

/**
 * One tally per day in the window: how much was scheduled, how much was done.
 *
 * The shared basis for perfect days, the trailing rates and the heatmap, so
 * those three can never disagree about what a day contained.
 */
export function dailyTally(input: ReportInput, from: LocalDate, to: LocalDate): DayTally[] {
  const scheduledOn = new Map<LocalDate, number>();
  const doneOn = new Map<LocalDate, number>();

  for (const task of input.tasks) {
    const days = occurrencesInWindow(task.schedule, from, to);
    const done = input.completions.get(task.id);

    for (const day of days) {
      scheduledOn.set(day, (scheduledOn.get(day) ?? 0) + 1);
      if (done?.has(day)) doneOn.set(day, (doneOn.get(day) ?? 0) + 1);
    }
  }

  const tally: DayTally[] = [];
  for (let day = toDayNumber(from); day <= toDayNumber(to); day++) {
    const date = addDays(from, day - toDayNumber(from));
    tally.push({
      date,
      scheduled: scheduledOn.get(date) ?? 0,
      done: doneOn.get(date) ?? 0,
    });
  }
  return tally;
}

export interface PerfectDays {
  /** Days where every scheduled occurrence was completed. */
  count: number;
  /** The run ending today — the number worth protecting. */
  current: number;
}

/**
 * Days on which everything scheduled was completed.
 *
 * A day with **nothing scheduled is not perfect** — counting it would inflate
 * the number for anyone who takes weekends off, and would mean the metric
 * rewarded having no routines. It does not break the run either: like a streak,
 * an unscheduled day is simply not part of the question.
 *
 * Today counts only once it is actually complete; an open day is not a failure.
 */
export function perfectDays(tally: readonly DayTally[], today: LocalDate): PerfectDays {
  let count = 0;
  for (const day of tally) {
    if (day.scheduled > 0 && day.done >= day.scheduled) count += 1;
  }

  let current = 0;
  for (const day of [...tally].reverse()) {
    if (day.scheduled === 0) continue;
    const complete = day.done >= day.scheduled;
    if (complete) {
      current += 1;
      continue;
    }
    if (day.date === today) continue; // still open
    break;
  }

  return { count, current };
}

export interface CompletionRate {
  days: number;
  scheduled: number;
  done: number;
  /** Whole percent, or `null` when nothing was scheduled in the window. */
  percent: number | null;
}

export const RATE_WINDOWS = [7, 30, 90] as const;

/**
 * Done over scheduled across a trailing window, including today.
 *
 * Trailing rather than all-time, so recent effort is not drowned by ancient
 * history (`prd/08-reports.md`). Including today costs at most one day of bias
 * and keeps the number live rather than stale until midnight.
 *
 * `null` for an empty window, not zero: "nothing was scheduled" and "everything
 * was missed" are different facts, and a 0% badge for the first would be a lie.
 */
export function completionRate(input: ReportInput, days: number): CompletionRate {
  const from = addDays(input.today, -(days - 1));
  const tally = dailyTally(input, from, input.today);

  let scheduled = 0;
  let done = 0;
  for (const day of tally) {
    scheduled += day.scheduled;
    done += day.done;
  }

  return {
    days,
    scheduled,
    done,
    percent: scheduled === 0 ? null : Math.round((done * 100) / scheduled),
  };
}

export interface WeekdayShape {
  /** 0 = Monday, matching the mask and the weekly grid. */
  weekday: Weekday;
  label: (typeof WEEKDAYS)[number];
  scheduled: number;
  done: number;
  percent: number | null;
}

/**
 * Completion rate broken out by day of week — the view that surfaces the honest
 * pattern (*Mondays hold, Fridays collapse*).
 *
 * **Monday-first.** The mask's bit 0 is Monday, the weekly grid is Monday-first,
 * and `weekdayOf` agrees; a `getDay()` here would rotate the whole histogram by
 * one day and produce something that looks completely reasonable.
 */
export function weekdayShape(input: ReportInput, days = 90): WeekdayShape[] {
  const from = addDays(input.today, -(days - 1));
  const tally = dailyTally(input, from, input.today);

  const shape: WeekdayShape[] = WEEKDAYS.map((label, index) => ({
    weekday: index as Weekday,
    label,
    scheduled: 0,
    done: 0,
    percent: null,
  }));

  for (const day of tally) {
    const slot = shape[weekdayOf(day.date)] as WeekdayShape;
    slot.scheduled += day.scheduled;
    slot.done += day.done;
  }

  for (const slot of shape) {
    slot.percent = slot.scheduled === 0 ? null : Math.round((slot.done * 100) / slot.scheduled);
  }

  return shape;
}

export interface MomentumReport {
  today: LocalDate;
  streaks: StreakReport[];
  perfect: PerfectDays;
  rates: CompletionRate[];
  weekdays: WeekdayShape[];
  /**
   * One entry per day, oldest first — the heatmap's data.
   *
   * The same tally the rates and the perfect-day count are computed from, so
   * the three can never disagree about what a day contained.
   */
  days: DayTally[];
}

/** Everything R-01 owns, from one pass over the same inputs. */
export function momentumReport(input: ReportInput): MomentumReport {
  const from = addDays(input.today, -(MAX_HISTORY_DAYS - 1));
  const tally = dailyTally(input, from, input.today);

  return {
    today: input.today,
    // Streaks are a routine's headline number; a one-off has no rhythm to keep.
    streaks: input.tasks
      .filter((task) => task.schedule.kind === "routine")
      .map((task) => streakFor(task, input.completions.get(task.id) ?? new Set(), input.today)),
    perfect: perfectDays(tally, input.today),
    rates: RATE_WINDOWS.map((days) => completionRate(input, days)),
    weekdays: weekdayShape(input),
    days: tally,
  };
}

// ── Effort and collection ────────────────────────────────────────────────────

/**
 * The Monday that starts the week a date falls in.
 *
 * Weeks are keyed by that Monday's civil date rather than an ISO week number.
 * `2026-W53`, weeks that belong to the previous year, and the 52-vs-53 question
 * are a class of bug worth not importing; a date sorts correctly, is unambiguous
 * and is Monday-first like the mask and the grid.
 */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -weekdayOf(date));
}

/** `YYYY-MM` — the calendar month a date falls in. */
export function monthKey(date: LocalDate): string {
  return date.slice(0, 7);
}

/** A coin is a minute, so one number carries both (`prd/08-reports.md` §Effort). */
export interface EffortBucket {
  /** The Monday of the week, or `YYYY-MM` for a month. */
  key: string;
  minutes: number;
  coins: number;
}

/** One earning, as the ledger recorded it. Negative amounts are reversals. */
export interface EarnedCoins {
  /** The user's civil date the coins were earned on. */
  date: LocalDate;
  amountCoins: number;
  /** Which epic the work belonged to, or null when unassigned. */
  epicId: string | null;
}

/**
 * Minutes invested per week and per month.
 *
 * Summed from the **ledger**, not from occurrence snapshots. Uncompleting an
 * occurrence appends a negative `task_reward` row and leaves the occurrence's
 * snapshot intact — the trigger forbids nulling it — so a snapshot sum would
 * count work that was taken back. The ledger nets to zero by itself.
 *
 * Empty buckets are filled in, so a chart has no holes where a quiet week was.
 */
export function effortByWeek(
  earnings: readonly EarnedCoins[],
  from: LocalDate,
  to: LocalDate,
): EffortBucket[] {
  const totals = new Map<string, number>();
  for (const earning of earnings) {
    const key = weekStart(earning.date);
    totals.set(key, (totals.get(key) ?? 0) + earning.amountCoins);
  }

  const buckets: EffortBucket[] = [];
  for (let monday = weekStart(from); compareDates(monday, to) <= 0; monday = addDays(monday, 7)) {
    const coins = totals.get(monday) ?? 0;
    buckets.push({ key: monday, minutes: coins, coins });
  }
  return buckets;
}

export function effortByMonth(
  earnings: readonly EarnedCoins[],
  from: LocalDate,
  to: LocalDate,
): EffortBucket[] {
  const totals = new Map<string, number>();
  for (const earning of earnings) {
    const key = monthKey(earning.date);
    totals.set(key, (totals.get(key) ?? 0) + earning.amountCoins);
  }

  const buckets: EffortBucket[] = [];
  const seen = new Set<string>();
  for (let day = from; compareDates(day, to) <= 0; day = addDays(day, 1)) {
    const key = monthKey(day);
    if (seen.has(key)) continue;
    seen.add(key);
    const coins = totals.get(key) ?? 0;
    buckets.push({ key, minutes: coins, coins });
  }
  return buckets;
}

export interface EpicEffort {
  /** Null for work that belongs to no epic. */
  epicId: string | null;
  minutes: number;
}

/**
 * Where the time actually went — which is often not where it was intended to go.
 *
 * Attributed to the task's **current** epic. A task can be reassigned, and the
 * question is how the user organises things now; retroactive attribution would
 * need an epic snapshot per completion, which is exactly the new tracking this
 * report is not allowed to require.
 */
export function effortByEpic(earnings: readonly EarnedCoins[]): EpicEffort[] {
  const totals = new Map<string | null, number>();
  for (const earning of earnings) {
    totals.set(earning.epicId, (totals.get(earning.epicId) ?? 0) + earning.amountCoins);
  }

  return [...totals.entries()]
    .map(([epicId, minutes]) => ({ epicId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export interface CollectionPoint {
  date: LocalDate;
  /** Distinct stickers owned by the end of this day. */
  stickers: number;
}

/**
 * The collection growing — one running total per day.
 *
 * Counted from first acquisition, so a **duplicate does not move the line**: a
 * repeat pull is a ledger row but not a new sticker, and the collection is what
 * grows. Duplicates carry no timestamp of their own and are invisible here,
 * which is the honest answer rather than a limitation.
 */
export function stickersOverTime(
  acquiredOn: readonly LocalDate[],
  from: LocalDate,
  to: LocalDate,
): CollectionPoint[] {
  const perDay = new Map<LocalDate, number>();
  let before = 0;
  for (const day of acquiredOn) {
    if (compareDates(day, from) < 0) {
      before += 1;
      continue;
    }
    if (compareDates(day, to) > 0) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  const points: CollectionPoint[] = [];
  let running = before;
  for (let day = from; compareDates(day, to) <= 0; day = addDays(day, 1)) {
    running += perDay.get(day) ?? 0;
    points.push({ date: day, stickers: running });
  }
  return points;
}

export interface FinishedAlbum {
  albumId: string;
  title: string;
  coverKey: string;
  completedOn: LocalDate;
}

export interface EffortReport {
  today: LocalDate;
  weeks: EffortBucket[];
  months: EffortBucket[];
  epics: EpicEffort[];
  collection: CollectionPoint[];
  /** A count and a shelf of finished covers (`prd/08-reports.md` §Collection). */
  albumsCompleted: number;
  shelf: FinishedAlbum[];
}
