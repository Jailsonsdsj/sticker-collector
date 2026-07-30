import { describe, expect, it } from "vitest";
import { addDays, type LocalDate, maskFromDays, WEEKDAYS, weekdayOf } from "./recurrence.js";
import {
  completionRate,
  dailyTally,
  effortByEpic,
  effortByMonth,
  effortByWeek,
  MAX_HISTORY_DAYS,
  momentumReport,
  monthKey,
  perfectDays,
  type ReportInput,
  type ReportTask,
  stickersOverTime,
  streakFor,
  weekdayShape,
  weekStart,
} from "./reports.js";

/**
 * Momentum aggregates.
 *
 * Fixed dates throughout: 2026-07-27 is a **Monday**, which makes every
 * weekday claim below checkable by hand rather than by trusting the helper
 * under test.
 */
const MONDAY: LocalDate = "2026-07-27";
const TUESDAY: LocalDate = "2026-07-28";
const WEDNESDAY: LocalDate = "2026-07-29";
const THURSDAY: LocalDate = "2026-07-30";
const FRIDAY: LocalDate = "2026-07-31";
const SATURDAY: LocalDate = "2026-08-01";
const SUNDAY: LocalDate = "2026-08-02";

/** Mon=0 … Sun=6, asserted rather than assumed. */
it("is anchored on a real Monday", () => {
  expect(weekdayOf(MONDAY)).toBe(0);
  expect(weekdayOf(SUNDAY)).toBe(6);
  expect(WEEKDAYS[0]).toBe("Mon");
});

const routine = (id: string, days: number[], over: Partial<ReportTask> = {}): ReportTask => ({
  id,
  title: id,
  schedule: {
    kind: "routine",
    weekdays: maskFromDays(days as never),
    startsOn: null,
    endsOn: null,
  },
  ...over,
});

const oneoff = (id: string, dueOn: LocalDate | null): ReportTask => ({
  id,
  title: id,
  schedule: { kind: "oneoff", dueOn },
});

const input = (
  tasks: ReportTask[],
  completions: Record<string, LocalDate[]>,
  today: LocalDate,
): ReportInput => ({
  tasks,
  completions: new Map(Object.entries(completions).map(([id, days]) => [id, new Set(days)])),
  today,
});

const streak = (task: ReportTask, days: LocalDate[], today: LocalDate) =>
  streakFor(task, new Set(days), today);

describe("an unscheduled day never breaks a streak", () => {
  it("steps over a day the routine was not scheduled", () => {
    // Mon/Wed/Fri, done Mon and Wed. Tuesday is not part of the question.
    const mwf = routine("mwf", [0, 2, 4]);
    expect(streak(mwf, [MONDAY, WEDNESDAY], WEDNESDAY).current).toBe(2);
  });

  it("survives a whole weekend for a weekday routine", () => {
    const weekdays = routine("weekdays", [0, 1, 2, 3, 4]);
    const done = [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY];
    // Monday of the following week.
    const nextMonday = addDays(MONDAY, 7);
    expect(streak(weekdays, [...done, nextMonday], nextMonday).current).toBe(6);
  });

  it("breaks on a scheduled day that was missed", () => {
    // Same routine, Wednesday skipped: only Friday survives.
    const mwf = routine("mwf", [0, 2, 4]);
    expect(streak(mwf, [MONDAY, FRIDAY], FRIDAY).current).toBe(1);
  });

  it("counts nothing when the scheduled day before today was missed", () => {
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    expect(streak(daily, [MONDAY], WEDNESDAY).current).toBe(0);
  });
});

describe("today is never a breaker", () => {
  it("keeps a streak alive while today is still open", () => {
    // Scheduled today, not done yet: the streak stands at yesterday's value.
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    expect(streak(daily, [MONDAY, TUESDAY], WEDNESDAY).current).toBe(2);
  });

  it("extends the streak once today is done", () => {
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    expect(streak(daily, [MONDAY, TUESDAY, WEDNESDAY], WEDNESDAY).current).toBe(3);
  });
});

describe("the longest streak", () => {
  it("outlives the break that ended it", () => {
    // Mon–Wed done, Thursday missed, Friday done: current 1, longest 3.
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    const report = streak(daily, [MONDAY, TUESDAY, WEDNESDAY, FRIDAY], FRIDAY);
    expect(report.current).toBe(1);
    expect(report.longest).toBe(3);
  });

  it("is never less than the current streak", () => {
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    const report = streak(daily, [MONDAY, TUESDAY, WEDNESDAY], WEDNESDAY);
    expect(report.longest).toBeGreaterThanOrEqual(report.current);
  });

  it("is zero for a routine never completed", () => {
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    const report = streak(daily, [], WEDNESDAY);
    expect(report).toMatchObject({ current: 0, longest: 0, lastCompletedOn: null });
  });

  it("remembers when the routine was last done", () => {
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    expect(streak(daily, [MONDAY, TUESDAY], WEDNESDAY).lastCompletedOn).toBe(TUESDAY);
  });

  it("looks no further back than a year", () => {
    // A completion older than the window is invisible — to `longest` as much as
    // to `current`. An unbounded walk is how this becomes a timeout on a 10 ms
    // budget, so the bound has to be observable, not merely intended.
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    const ancient = addDays(MONDAY, -(MAX_HISTORY_DAYS + 30));
    expect(streak(daily, [ancient], MONDAY)).toMatchObject({ current: 0, longest: 0 });
  });

  it("counts the oldest day inside the window, and not the one before it", () => {
    const daily = routine("daily", [0, 1, 2, 3, 4, 5, 6]);
    const oldestInside = addDays(MONDAY, -(MAX_HISTORY_DAYS - 1));
    const justOutside = addDays(MONDAY, -MAX_HISTORY_DAYS);

    expect(streak(daily, [oldestInside], MONDAY).longest).toBe(1);
    expect(streak(daily, [justOutside], MONDAY).longest).toBe(0);
  });
});

describe("a routine's own dates bound the walk", () => {
  it("does not count days before it started", () => {
    const started = routine("started", [0, 1, 2, 3, 4, 5, 6], {
      schedule: {
        kind: "routine",
        weekdays: maskFromDays([0, 1, 2, 3, 4, 5, 6] as never),
        startsOn: TUESDAY,
        endsOn: null,
      },
    });
    // Monday is before it existed, so missing it is not a break.
    expect(streak(started, [TUESDAY, WEDNESDAY], WEDNESDAY).current).toBe(2);
  });
});

describe("perfect days", () => {
  const two = [routine("a", [0, 1, 2, 3, 4, 5, 6]), routine("b", [0, 1, 2, 3, 4, 5, 6])];

  const tallyFor = (completions: Record<string, LocalDate[]>, from: LocalDate, to: LocalDate) =>
    dailyTally(input(two, completions, to), from, to);

  it("counts a day where everything scheduled was done", () => {
    const tally = tallyFor({ a: [MONDAY], b: [MONDAY] }, MONDAY, MONDAY);
    expect(perfectDays(tally, MONDAY)).toEqual({ count: 1, current: 1 });
  });

  it("does not count a day where one of two was done", () => {
    const tally = tallyFor({ a: [MONDAY] }, MONDAY, MONDAY);
    expect(perfectDays(tally, MONDAY).count).toBe(0);
  });

  it("does not count a day with nothing scheduled", () => {
    // Vacuously perfect days would inflate the number for anyone with weekends
    // off, and would reward having no routines at all.
    const weekdaysOnly = [routine("a", [0, 1, 2, 3, 4])];
    const tally = dailyTally(input(weekdaysOnly, {}, SUNDAY), SATURDAY, SUNDAY);
    expect(perfectDays(tally, SUNDAY).count).toBe(0);
  });

  it("does not let an empty day break the run", () => {
    const weekdaysOnly = [routine("a", [0, 1, 2, 3, 4])];
    const done = { a: [FRIDAY, addDays(MONDAY, 7)] };
    const nextMonday = addDays(MONDAY, 7);
    const tally = dailyTally(input(weekdaysOnly, done, nextMonday), FRIDAY, nextMonday);
    // Friday perfect, Sat/Sun empty, Monday perfect: a run of two.
    expect(perfectDays(tally, nextMonday).current).toBe(2);
  });

  it("does not end the run just because today is still open", () => {
    const tally = tallyFor({ a: [MONDAY], b: [MONDAY] }, MONDAY, TUESDAY);
    expect(perfectDays(tally, TUESDAY).current).toBe(1);
  });

  it("ends the run at a day that was genuinely incomplete", () => {
    const tally = tallyFor({ a: [MONDAY, TUESDAY], b: [TUESDAY] }, MONDAY, WEDNESDAY);
    // Monday half done, Tuesday perfect, Wednesday open.
    expect(perfectDays(tally, WEDNESDAY)).toEqual({ count: 1, current: 1 });
  });
});

describe("trailing completion rate", () => {
  const daily = [routine("daily", [0, 1, 2, 3, 4, 5, 6])];

  it("is done over scheduled across the window", () => {
    // Seven days ending Sunday, four done.
    const done = [MONDAY, TUESDAY, WEDNESDAY, THURSDAY];
    const rate = completionRate(input(daily, { daily: done }, SUNDAY), 7);
    expect(rate).toMatchObject({ days: 7, scheduled: 7, done: 4, percent: 57 });
  });

  it("reports nothing rather than zero when nothing was scheduled", () => {
    // "Nothing was scheduled" and "everything was missed" are different facts.
    const rate = completionRate(input([oneoff("x", null)], {}, SUNDAY), 30);
    expect(rate.scheduled).toBe(0);
    expect(rate.percent).toBeNull();
  });

  it("counts a one-off on its due day only", () => {
    const tasks = [oneoff("dentist", WEDNESDAY)];
    expect(completionRate(input(tasks, { dentist: [WEDNESDAY] }, SUNDAY), 7)).toMatchObject({
      scheduled: 1,
      done: 1,
      percent: 100,
    });
  });

  it("narrows with the window", () => {
    const done = [MONDAY];
    const week = completionRate(input(daily, { daily: done }, SUNDAY), 7);
    const month = completionRate(input(daily, { daily: done }, SUNDAY), 30);
    expect(week.scheduled).toBe(7);
    expect(month.scheduled).toBe(30);
    expect(week.percent).toBeGreaterThan(month.percent as number);
  });
});

describe("weekday shape is Monday-first", () => {
  it("puts Monday at index 0 and Sunday at index 6", () => {
    const shape = weekdayShape(input([routine("d", [0, 1, 2, 3, 4, 5, 6])], {}, SUNDAY));
    expect(shape.map((slot) => slot.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(shape[0]?.weekday).toBe(0);
  });

  it("puts a Tuesday-only routine at index 1, and nowhere else", () => {
    // This is the assertion that fails loudly under a Sunday-first assumption:
    // the histogram would be rotated by one and look entirely plausible.
    const tuesdays = [routine("tue", [1])];
    const shape = weekdayShape(input(tuesdays, { tue: [TUESDAY] }, SUNDAY), 7);

    expect(shape[1]).toMatchObject({ label: "Tue", scheduled: 1, done: 1, percent: 100 });
    for (const index of [0, 2, 3, 4, 5, 6]) {
      expect(shape[index]?.scheduled, WEEKDAYS[index]).toBe(0);
    }
  });

  it("puts a Sunday-only routine at index 6", () => {
    const sundays = [routine("sun", [6])];
    const shape = weekdayShape(input(sundays, { sun: [SUNDAY] }, SUNDAY), 7);
    expect(shape[6]).toMatchObject({ label: "Sun", scheduled: 1, done: 1 });
    expect(shape[0]?.scheduled).toBe(0);
  });

  it("shows the honest pattern when one weekday collapses", () => {
    // Mondays hold, Fridays collapse.
    const weekdays = [routine("w", [0, 1, 2, 3, 4])];
    const done = [MONDAY, TUESDAY, WEDNESDAY, THURSDAY];
    const shape = weekdayShape(input(weekdays, { w: done }, SUNDAY), 7);

    expect(shape[0]?.percent).toBe(100);
    expect(shape[4]?.percent).toBe(0);
  });

  it("reports no rate for a weekday that is never scheduled", () => {
    const weekdays = [routine("w", [0, 1, 2, 3, 4])];
    const shape = weekdayShape(input(weekdays, {}, SUNDAY), 7);
    expect(shape[5]?.percent).toBeNull();
    expect(shape[6]?.percent).toBeNull();
  });
});

describe("the whole report", () => {
  it("gives streaks to routines only", () => {
    // A one-off has no rhythm to keep.
    const tasks = [routine("daily", [0, 1, 2, 3, 4, 5, 6]), oneoff("dentist", WEDNESDAY)];
    const report = momentumReport(input(tasks, { daily: [WEDNESDAY] }, WEDNESDAY));

    expect(report.streaks.map((s) => s.taskId)).toEqual(["daily"]);
  });

  it("carries all three trailing windows", () => {
    const report = momentumReport(input([routine("d", [0, 1, 2, 3, 4, 5, 6])], {}, SUNDAY));
    expect(report.rates.map((rate) => rate.days)).toEqual([7, 30, 90]);
  });

  it("reports something sensible for a user with no tasks at all", () => {
    const report = momentumReport(input([], {}, SUNDAY));
    expect(report.streaks).toEqual([]);
    expect(report.perfect).toEqual({ count: 0, current: 0 });
    expect(report.rates.every((rate) => rate.percent === null)).toBe(true);
    expect(report.weekdays).toHaveLength(7);
  });

  it("agrees with its own parts", () => {
    // The rates, the perfect days and the weekday shape all come from one tally,
    // so they cannot disagree about what a day contained.
    const tasks = [routine("d", [0, 1, 2, 3, 4, 5, 6])];
    const done = [MONDAY, TUESDAY, WEDNESDAY];
    const report = momentumReport(input(tasks, { d: done }, WEDNESDAY));

    const week = report.rates[0] as { done: number };
    const fromShape = report.weekdays.reduce((sum, slot) => sum + slot.done, 0);
    expect(fromShape).toBeGreaterThanOrEqual(week.done);
    expect(report.streaks[0]?.current).toBe(3);
  });
});

describe("week and month keys", () => {
  it("keys a week by the Monday it started", () => {
    // A date, not an ISO week number: `2026-W53` and weeks that belong to the
    // previous year are a class of bug worth not importing.
    expect(weekStart(MONDAY)).toBe(MONDAY);
    expect(weekStart(WEDNESDAY)).toBe(MONDAY);
    expect(weekStart(SUNDAY)).toBe(MONDAY);
  });

  it("puts Sunday in the week that started the previous Monday", () => {
    // The failure mode of a Sunday-first week: Sunday jumping forward a week.
    expect(weekStart(SUNDAY)).toBe(MONDAY);
    expect(weekStart(addDays(SUNDAY, 1))).toBe(addDays(MONDAY, 7));
  });

  it("keys a month by the calendar month", () => {
    expect(monthKey(WEDNESDAY)).toBe("2026-07");
    expect(monthKey(SATURDAY)).toBe("2026-08");
  });
});

describe("minutes invested", () => {
  const earn = (date: LocalDate, amountCoins: number, epicId: string | null = null) => ({
    date,
    amountCoins,
    epicId,
  });

  it("is the same number as coins earned", () => {
    // A coin is a minute; the two are one axis, not two.
    const weeks = effortByWeek([earn(MONDAY, 45), earn(TUESDAY, 30)], MONDAY, SUNDAY);
    expect(weeks).toEqual([{ key: MONDAY, minutes: 75, coins: 75 }]);
  });

  it("nets out a reversal, so work taken back is not counted", () => {
    // Uncompleting appends a NEGATIVE task_reward and leaves the occurrence's
    // snapshot intact — a snapshot sum would still count it.
    const weeks = effortByWeek([earn(MONDAY, 45), earn(TUESDAY, -45)], MONDAY, SUNDAY);
    expect(weeks[0]?.minutes).toBe(0);
  });

  it("splits at the week boundary", () => {
    const nextMonday = addDays(MONDAY, 7);
    const weeks = effortByWeek([earn(SUNDAY, 10), earn(nextMonday, 99)], MONDAY, nextMonday);
    expect(weeks).toEqual([
      { key: MONDAY, minutes: 10, coins: 10 },
      { key: nextMonday, minutes: 99, coins: 99 },
    ]);
  });

  it("leaves no hole where a quiet week was", () => {
    const threeWeeksOn = addDays(MONDAY, 14);
    const weeks = effortByWeek([earn(MONDAY, 30)], MONDAY, threeWeeksOn);
    expect(weeks.map((bucket) => bucket.minutes)).toEqual([30, 0, 0]);
  });

  it("splits at the month boundary", () => {
    const months = effortByMonth([earn(FRIDAY, 20), earn(SATURDAY, 5)], MONDAY, SATURDAY);
    expect(months).toEqual([
      { key: "2026-07", minutes: 20, coins: 20 },
      { key: "2026-08", minutes: 5, coins: 5 },
    ]);
  });

  it("reports a month with no work at all", () => {
    const months = effortByMonth([], MONDAY, SATURDAY);
    expect(months.map((bucket) => bucket.key)).toEqual(["2026-07", "2026-08"]);
    expect(months.every((bucket) => bucket.minutes === 0)).toBe(true);
  });
});

describe("effort by epic", () => {
  const earn = (date: LocalDate, amountCoins: number, epicId: string | null) => ({
    date,
    amountCoins,
    epicId,
  });

  it("sums the time each epic actually received", () => {
    const epics = effortByEpic([
      earn(MONDAY, 45, "e1"),
      earn(TUESDAY, 15, "e1"),
      earn(WEDNESDAY, 90, "e2"),
    ]);
    expect(epics).toEqual([
      { epicId: "e2", minutes: 90 },
      { epicId: "e1", minutes: 60 },
    ]);
  });

  it("keeps unassigned work visible rather than dropping it", () => {
    const epics = effortByEpic([earn(MONDAY, 30, null), earn(TUESDAY, 10, "e1")]);
    expect(epics.find((epic) => epic.epicId === null)?.minutes).toBe(30);
  });

  it("nets a reversal against the epic it came from", () => {
    const epics = effortByEpic([earn(MONDAY, 45, "e1"), earn(TUESDAY, -45, "e1")]);
    expect(epics).toEqual([{ epicId: "e1", minutes: 0 }]);
  });
});

describe("the collection growing", () => {
  it("is a running total, one point per day", () => {
    const points = stickersOverTime([MONDAY, MONDAY, WEDNESDAY], MONDAY, THURSDAY);
    expect(points.map((point) => point.stickers)).toEqual([2, 2, 3, 3]);
  });

  it("starts from what was already owned before the window", () => {
    const earlier = addDays(MONDAY, -30);
    const points = stickersOverTime([earlier, earlier, TUESDAY], MONDAY, TUESDAY);
    expect(points.map((point) => point.stickers)).toEqual([2, 3]);
  });

  it("never moves for a duplicate", () => {
    // A repeat pull is a ledger row but not a new sticker: only first
    // acquisitions appear here at all.
    const points = stickersOverTime([MONDAY], MONDAY, TUESDAY);
    expect(points.map((point) => point.stickers)).toEqual([1, 1]);
  });

  it("ignores an acquisition after the window", () => {
    const points = stickersOverTime([MONDAY, addDays(SUNDAY, 5)], MONDAY, SUNDAY);
    expect(points.at(-1)?.stickers).toBe(1);
  });

  it("is flat at zero for an empty collection", () => {
    const points = stickersOverTime([], MONDAY, WEDNESDAY);
    expect(points).toEqual([
      { date: MONDAY, stickers: 0 },
      { date: TUESDAY, stickers: 0 },
      { date: WEDNESDAY, stickers: 0 },
    ]);
  });
});

describe("a week that lost more than it gained", () => {
  it("reports the signed net, not its magnitude", () => {
    // A reversal whose original completion sits outside the window leaves a
    // genuinely negative week. Clamping it would make the buckets stop summing
    // to the wallet, which is the one thing they must never do.
    const weeks = effortByWeek([{ date: MONDAY, amountCoins: -45, epicId: null }], MONDAY, SUNDAY);
    expect(weeks[0]?.minutes).toBe(-45);
    expect(weeks[0]?.coins).toBe(-45);
  });

  it("reports a negative month the same way", () => {
    const months = effortByMonth(
      [{ date: MONDAY, amountCoins: -10, epicId: null }],
      MONDAY,
      MONDAY,
    );
    expect(months[0]?.minutes).toBe(-10);
  });
});

describe("the heatmap's data", () => {
  it("comes from the same tally as the rates and the perfect days", () => {
    const tasks = [routine("d", [0, 1, 2, 3, 4, 5, 6])];
    const report = momentumReport(input(tasks, { d: [MONDAY, TUESDAY] }, WEDNESDAY));

    expect(report.days.at(-1)?.date).toBe(WEDNESDAY);
    expect(report.days).toHaveLength(MAX_HISTORY_DAYS);

    const doneInSeries = report.days.reduce((sum, day) => sum + day.done, 0);
    const doneInRate = (report.rates.at(-1) as { done: number }).done;
    expect(doneInSeries).toBe(doneInRate);
  });

  it("marks a scheduled-but-missed day differently from an empty one", () => {
    // The distinction the heatmap is built on, at the data level.
    const weekdaysOnly = [routine("w", [0, 1, 2, 3, 4])];
    const report = momentumReport(input(weekdaysOnly, {}, SUNDAY));

    const friday = report.days.find((day) => day.date === FRIDAY);
    const saturday = report.days.find((day) => day.date === SATURDAY);
    expect(friday).toMatchObject({ scheduled: 1, done: 0 });
    expect(saturday).toMatchObject({ scheduled: 0, done: 0 });
  });
});
