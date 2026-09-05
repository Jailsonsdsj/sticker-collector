import type { Occurrence, Task } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import {
  agendaBlocks,
  agendaHours,
  blocksOn,
  hourRows,
  isNow,
  laneOut,
  minutesNowIn,
  nowMarker,
  openingHour,
  scheduledRoutines,
} from "./agenda";

/** Monday-first, so index 0 is 2026-08-17 (a Monday). */
const DATES = [
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
  "2026-08-22",
  "2026-08-23",
];

const routine = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1",
    epicId: null,
    title: "Gym",
    description: null,
    url: null,
    effortMinutes: 60,
    rewardCoins: 60,
    priority: "medium",
    type: "routine",
    weekdays: 0b1111111,
    startsOn: null,
    endsOn: null,
    dueAt: null,
    pinnedOn: null,
    startedAt: null,
    slots: [],
    subtasks: [],
    blockUntilSteps: false,
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
    ...over,
  }) as Task;

const done = (taskId: string, scheduledOn: string): Occurrence => ({
  taskId,
  scheduledOn,
  status: "done",
  completedAt: `${scheduledOn}T12:00:00Z`,
  rewardSnapshotCoins: 60,
});

describe("which routines the agenda shows", () => {
  it("shows only the ones with times", () => {
    // Every routine created before the agenda has none, and a block with no
    // hour has nowhere to go.
    const timed = routine({ id: "a", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] });
    const untimed = routine({ id: "b" });

    expect(scheduledRoutines([timed, untimed]).map((task) => task.id)).toEqual(["a"]);
  });

  it("leaves out one-offs and deleted routines", () => {
    const oneoff = routine({
      id: "o",
      type: "oneoff",
      weekdays: null,
      slots: [{ weekday: 0, startMin: 600, endMin: 660 }],
    });
    const gone = routine({
      id: "d",
      deletedAt: "2026-08-01T00:00:00Z",
      slots: [{ weekday: 0, startMin: 600, endMin: 660 }],
    });

    expect(scheduledRoutines([oneoff, gone])).toEqual([]);
  });
});

describe("which hours the column shows", () => {
  it("runs from the earliest start to the latest end", () => {
    // A person whose day starts at six should not scroll past six empty rows
    // to reach it.
    const early = routine({ id: "a", slots: [{ weekday: 0, startMin: 6 * 60, endMin: 7 * 60 }] });
    const late = routine({ id: "b", slots: [{ weekday: 2, startMin: 22 * 60, endMin: 23 * 60 }] });

    expect(agendaHours([early, late])).toEqual({ from: 6, to: 23 });
  });

  it("rounds a part-hour outwards at both ends", () => {
    // 09:30–10:30 needs the 09:00 row to start in and the 10:00 row to finish
    // in.
    const task = routine({ slots: [{ weekday: 0, startMin: 570, endMin: 630 }] });

    expect(agendaHours([task])).toEqual({ from: 9, to: 11 });
  });

  it("always leaves at least one row", () => {
    // A 09:00–09:30 block would otherwise span nothing at all.
    const task = routine({ slots: [{ weekday: 0, startMin: 540, endMin: 570 }] });

    expect(agendaHours([task])).toEqual({ from: 9, to: 10 });
  });

  it("is null when nothing has a time", () => {
    // The caller shows an empty state; an empty grid says nothing.
    expect(agendaHours([routine()])).toBeNull();
    expect(agendaHours([])).toBeNull();
  });

  it("lists the rows it covers", () => {
    expect(hourRows({ from: 9, to: 12 })).toEqual([9, 10, 11]);
  });
});

describe("placing the blocks", () => {
  it("carries the real date of the day it falls on", () => {
    // A completion is keyed by date. Deriving it later from a weekday is how a
    // week grid ticks the wrong day.
    const task = routine({ slots: [{ weekday: 3, startMin: 600, endMin: 660 }] });

    expect(agendaBlocks([task], DATES, [])).toMatchObject([{ date: "2026-08-20" }]);
  });

  it("marks a block done from that day's occurrence", () => {
    const task = routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] });

    const [block] = agendaBlocks([task], DATES, [done("t1", "2026-08-17")]);
    expect(block?.done).toBe(true);
  });

  it("does not carry another day's completion", () => {
    const task = routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] });

    const [block] = agendaBlocks([task], DATES, [done("t1", "2026-08-18")]);
    expect(block?.done).toBe(false);
  });

  it("drops a slot the mask no longer covers", () => {
    // The mask decides whether it runs; a slot only says when. A leftover slot
    // on an unchecked day must not appear.
    const task = routine({
      weekdays: 0b0000001, // Monday only
      slots: [
        { weekday: 0, startMin: 600, endMin: 660 },
        { weekday: 4, startMin: 600, endMin: 660 },
      ],
    });

    expect(agendaBlocks([task], DATES, [])).toHaveLength(1);
  });

  it("reads day by day, earliest first within a day", () => {
    const a = routine({
      id: "a",
      title: "Late",
      slots: [{ weekday: 1, startMin: 900, endMin: 960 }],
    });
    const b = routine({
      id: "b",
      title: "Early",
      slots: [{ weekday: 1, startMin: 540, endMin: 600 }],
    });
    const c = routine({
      id: "c",
      title: "Monday",
      slots: [{ weekday: 0, startMin: 600, endMin: 660 }],
    });

    expect(agendaBlocks([a, b, c], DATES, []).map((block) => block.task.title)).toEqual([
      "Monday",
      "Early",
      "Late",
    ]);
  });

  it("picks out one day's blocks", () => {
    const task = routine({
      slots: [
        { weekday: 0, startMin: 600, endMin: 660 },
        { weekday: 1, startMin: 600, endMin: 660 },
      ],
    });

    expect(blocksOn(agendaBlocks([task], DATES, []), 1)).toHaveLength(1);
  });
});

describe("where now is", () => {
  it("is a row and a fraction of the way down it", () => {
    // Per row, not per grid: a row holding a block is taller than an empty one.
    expect(nowMarker({ from: 9, to: 12 }, 9 * 60)).toEqual({ hour: 9, fraction: 0 });
    expect(nowMarker({ from: 9, to: 12 }, 10 * 60 + 30)).toEqual({ hour: 10, fraction: 0.5 });
  });

  it("is null outside the hours on screen", () => {
    expect(nowMarker({ from: 9, to: 11 }, 8 * 60 + 59)).toBeNull();
    expect(nowMarker({ from: 9, to: 11 }, 11 * 60)).toBeNull();
  });

  it("counts the last hour row as on screen for all of it", () => {
    // `to` is exclusive — 10:00–11:00 is the last row of a { from: 9, to: 11 }
    // grid, so 10:59 is still in it.
    expect(nowMarker({ from: 9, to: 11 }, 10 * 60 + 59)).toEqual({
      hour: 10,
      fraction: 59 / 60,
    });
  });

  it("reads the clock in the app's zone, not UTC", () => {
    // 01:00 UTC is 22:00 the previous evening in São Paulo — the same skew that
    // has bitten this app three times.
    const instant = new Date("2026-08-21T01:00:00Z");

    expect(minutesNowIn("UTC", instant)).toBe(60);
    expect(minutesNowIn("America/Sao_Paulo", instant)).toBe(22 * 60);
  });

  it("reads midnight as zero", () => {
    expect(minutesNowIn("UTC", new Date("2026-08-21T00:00:00Z"))).toBe(0);
  });
});

describe("which block is running", () => {
  const block = (weekday: number, startMin: number, endMin: number, date: string) => ({
    task: routine(),
    slot: { weekday, startMin, endMin },
    date,
    done: false,
  });

  it("is the one covering the current minute, today", () => {
    // 2026-08-17 is the Monday of the fixture week.
    expect(isNow(block(0, 600, 660, "2026-08-17"), "2026-08-17", 610)).toBe(true);
  });

  it("ends exactly when the block does", () => {
    // Half-open, like every other slot comparison: a block ending at 11:00 is
    // over at 11:00.
    expect(isNow(block(0, 600, 660, "2026-08-17"), "2026-08-17", 660)).toBe(false);
    expect(isNow(block(0, 600, 660, "2026-08-17"), "2026-08-17", 659)).toBe(true);
  });

  it("is never a block on another day", () => {
    expect(isNow(block(1, 600, 660, "2026-08-18"), "2026-08-17", 610)).toBe(false);
  });

  it("is never the same weekday in another week", () => {
    // The grid can be showing any week. Comparing weekdays instead of dates
    // marks next Monday's block as running because today is a Monday.
    expect(isNow(block(0, 600, 660, "2026-08-24"), "2026-08-17", 610)).toBe(false);
  });
});

describe("which hour the grid opens on", () => {
  const block = (startMin: number) => ({
    task: routine(),
    slot: { weekday: 0, startMin, endMin: startMin + 60 },
    date: "2026-08-17" as const,
    done: false,
  });

  it("is now, when now is on screen", () => {
    expect(openingHour({ hour: 16 }, [block(420)])).toBe(16);
  });

  it("falls back to the first thing scheduled", () => {
    // A day that is not today has no "now" to open on, and fourteen empty rows
    // above its only block is the same as an empty page.
    expect(openingHour(null, [block(21 * 60)])).toBe(21);
  });

  it("floors a part-hour start to its row", () => {
    expect(openingHour(null, [block(9 * 60 + 30)])).toBe(9);
  });

  it("is null when the day is empty", () => {
    expect(openingHour(null, [])).toBeNull();
  });
});

describe("two blocks at the same hour", () => {
  const at = (id: string, weekday: number, startMin: number, endMin: number) => ({
    task: routine({ id, slots: [{ weekday, startMin, endMin }] }),
    slot: { weekday, startMin, endMin },
    date: "2026-08-17" as const,
    done: false,
  });

  it("sit side by side rather than on top of each other", () => {
    // Grid items sharing a cell stack, so the later one covers the earlier and
    // a task vanishes from the day it was scheduled on.
    const placed = laneOut([at("a", 0, 600, 660), at("b", 0, 630, 690)]);

    expect(placed.map((block) => [block.task.id, block.lane, block.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
    ]);
  });

  it("leaves a day with no clash at full width", () => {
    const placed = laneOut([at("a", 0, 600, 660), at("b", 0, 900, 960)]);

    expect(placed.every((block) => block.lanes === 1)).toBe(true);
  });

  it("treats back to back as no clash", () => {
    // Half-open, like every other slot comparison here.
    const placed = laneOut([at("a", 0, 600, 660), at("b", 0, 660, 720)]);

    expect(placed.every((block) => block.lanes === 1)).toBe(true);
  });

  it("reuses a column once its block has ended", () => {
    // a 09–10, b 09:30–11, c 10–10:30: c fits back in a's column.
    const placed = laneOut([at("a", 0, 540, 600), at("b", 0, 570, 660), at("c", 0, 600, 630)]);

    expect(placed.find((block) => block.task.id === "c")?.lane).toBe(0);
    expect(placed.every((block) => block.lanes === 2)).toBe(true);
  });

  it("splits a day into independent groups across a gap", () => {
    // A morning clash must not narrow an evening block that clashes with
    // nothing.
    const placed = laneOut([at("a", 0, 540, 600), at("b", 0, 550, 610), at("c", 0, 1200, 1260)]);

    expect(placed.find((block) => block.task.id === "c")?.lanes).toBe(1);
  });

  it("keeps days apart", () => {
    // Same hour, different day, is not an overlap.
    const placed = laneOut([at("a", 0, 600, 660), at("b", 1, 600, 660)]);

    expect(placed.every((block) => block.lanes === 1)).toBe(true);
  });

  it("handles three at once", () => {
    const placed = laneOut([at("a", 0, 600, 700), at("b", 0, 610, 700), at("c", 0, 620, 700)]);

    expect(placed.map((block) => block.lane)).toEqual([0, 1, 2]);
    expect(placed.every((block) => block.lanes === 3)).toBe(true);
  });
});
