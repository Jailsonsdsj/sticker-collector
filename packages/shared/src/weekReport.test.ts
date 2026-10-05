import { describe, expect, it } from "vitest";
import { localClockIn, maskFromDays, WEEKDAYS_MASK_ALL } from "./recurrence.js";
import {
  buildWeekReport,
  type WeekReportCompletion,
  type WeekReportTask,
  weekReportReady,
} from "./weekReport.js";

/** 2026-07-27 is a Monday; the week runs to Sunday 2026-08-02. */
const MONDAY = "2026-07-27";
const WEDNESDAY = "2026-07-29";
const SUNDAY = "2026-08-02";
const UTC = "UTC";

const routine = (id: string, weekdays = WEEKDAYS_MASK_ALL): WeekReportTask => ({
  id,
  title: id,
  type: "routine",
  schedule: { kind: "routine", weekdays, startsOn: null, endsOn: null },
  rewardCoins: 30,
  epic: null,
});

const oneoff = (id: string): WeekReportTask => ({
  id,
  title: id,
  type: "oneoff",
  schedule: { kind: "oneoff", dueOn: null },
  rewardCoins: 45,
  epic: { title: "Home", accent: "epic-2" },
});

const tick = (
  taskId: string,
  scheduledOn: string,
  at: string,
  coins = 30,
): WeekReportCompletion => ({
  taskId,
  scheduledOn,
  completedAt: at,
  rewardSnapshotCoins: coins,
});

const build = (tasks: WeekReportTask[], completions: WeekReportCompletion[], timeZone = UTC) =>
  buildWeekReport({ weekStart: MONDAY, timeZone, tasks, completions, generatedAt: "x" });

describe("when the report exists", () => {
  it("is not ready before Sunday 22:00, the user's time", () => {
    expect(weekReportReady(MONDAY, UTC, new Date(`${SUNDAY}T21:59:00Z`))).toBe(false);
  });

  it("is ready from Sunday 22:00 on", () => {
    expect(weekReportReady(MONDAY, UTC, new Date(`${SUNDAY}T22:00:00Z`))).toBe(true);
    expect(weekReportReady(MONDAY, UTC, new Date("2026-08-05T08:00:00Z"))).toBe(true);
  });

  it("reads 22:00 on the user's clock, not the server's", () => {
    // 22:00 in Recife (UTC-3) is 01:00 UTC on Monday.
    expect(weekReportReady(MONDAY, "America/Recife", new Date(`${SUNDAY}T23:30:00Z`))).toBe(false);
    expect(weekReportReady(MONDAY, "America/Recife", new Date("2026-08-03T01:00:00Z"))).toBe(true);
  });
});

describe("the grid", () => {
  it("marks each scheduled day done or missed, and the others off", () => {
    const report = build(
      [routine("gym", maskFromDays([0, 2]))],
      [tick("gym", MONDAY, `${MONDAY}T09:00:00Z`)],
    );

    expect(report.routines[0]?.cells).toEqual([
      "done",
      "off",
      "missed",
      "off",
      "off",
      "off",
      "off",
    ]);
  });

  it("marks a run ticked on a later day as late", () => {
    const report = build(
      [routine("gym", maskFromDays([0]))],
      [tick("gym", MONDAY, `${WEDNESDAY}T09:00:00Z`)],
    );

    expect(report.routines[0]?.cells[0]).toBe("late");
  });

  it("does not count a tick after Sunday 22:00 — the report was already made", () => {
    const report = build(
      [routine("read", maskFromDays([6]))],
      [tick("read", SUNDAY, `${SUNDAY}T22:30:00Z`)],
    );

    expect(report.routines[0]?.cells[6]).toBe("missed");
  });

  it("leaves out a routine with nothing scheduled that week", () => {
    expect(build([routine("never", 0)], []).routines).toEqual([]);
  });

  it("dates a tick in the user's zone", () => {
    // 01:00 UTC Tuesday is still Monday evening in Recife.
    const report = build(
      [routine("gym", maskFromDays([0]))],
      [tick("gym", MONDAY, "2026-07-28T01:00:00Z")],
      "America/Recife",
    );

    expect(report.routines[0]?.cells[0]).toBe("done");
  });
});

describe("everything else done that week", () => {
  it("lists one-offs below the grid, with the day and what they paid", () => {
    const report = build(
      [oneoff("call")],
      [tick("call", "2026-07-01", `${WEDNESDAY}T10:00:00Z`, 45)],
    );

    expect(report.others).toEqual([
      {
        taskId: "call",
        title: "call",
        epicTitle: "Home",
        epicAccent: "epic-2",
        doneOn: WEDNESDAY,
        coins: 45,
      },
    ]);
  });

  it("does not list routines there — the grid already shows them", () => {
    const report = build([routine("gym")], [tick("gym", MONDAY, `${MONDAY}T09:00:00Z`)]);

    expect(report.others).toEqual([]);
  });

  it("leaves out work from another week", () => {
    const report = build([oneoff("call")], [tick("call", "2026-07-20", "2026-07-26T10:00:00Z")]);

    expect(report.others).toEqual([]);
  });
});

it("localClockIn reads the wall-clock minute", () => {
  expect(localClockIn(UTC, new Date(`${SUNDAY}T22:05:00Z`))).toEqual({
    date: SUNDAY,
    minutes: 22 * 60 + 5,
  });
});
