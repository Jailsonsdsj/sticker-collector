import { describe, expect, it } from "vitest";
import { WEEKDAYS_MASK_ALL, WEEKDAYS_MASK_WEEKDAYS } from "./recurrence";
import {
  clockToMinutes,
  describeSlot,
  findSlotConflicts,
  minutesToClock,
  type RoutineSlot,
  routineSlotSchema,
  routineSlotsSchema,
  slotsAgreeWithMask,
  slotsOverlap,
} from "./slots";

const slot = (weekday: number, start: string, end: string): RoutineSlot => ({
  weekday,
  startMin: clockToMinutes(start) as number,
  endMin: clockToMinutes(end) as number,
});

describe("what a slot may be", () => {
  it("accepts a normal block", () => {
    expect(routineSlotSchema.safeParse(slot(0, "12:00", "14:00")).success).toBe(true);
  });

  it("refuses a block that ends before it starts", () => {
    expect(routineSlotSchema.safeParse({ weekday: 0, startMin: 600, endMin: 540 }).success).toBe(
      false,
    );
  });

  it("refuses a block of no length", () => {
    // A zero-length block is a time, not a slot: it would occupy no row on the
    // agenda and could never be tapped.
    expect(routineSlotSchema.safeParse({ weekday: 0, startMin: 600, endMin: 600 }).success).toBe(
      false,
    );
  });

  it("lets a block run to midnight but not past it", () => {
    // 23:00–24:00 is the last hour of the day; anything beyond is the next day,
    // and inventing that day is what `routineSlotsSchema` refuses to guess.
    expect(routineSlotSchema.safeParse({ weekday: 0, startMin: 1380, endMin: 1440 }).success).toBe(
      true,
    );
    expect(routineSlotSchema.safeParse({ weekday: 0, startMin: 1380, endMin: 1500 }).success).toBe(
      false,
    );
  });

  it("refuses an overnight block outright, rather than splitting it silently", () => {
    // 22:00 → 01:00 is two blocks on two days. Inventing the second would put a
    // task on a Tuesday the user never chose.
    expect(routineSlotSchema.safeParse({ weekday: 0, startMin: 1320, endMin: 60 }).success).toBe(
      false,
    );
  });

  it("refuses a weekday that is not one of the seven", () => {
    expect(routineSlotSchema.safeParse({ weekday: 7, startMin: 0, endMin: 60 }).success).toBe(
      false,
    );
  });

  it("refuses two blocks on the same weekday", () => {
    // `occurrence` is unique on (task, date) and the ledger hangs off it, so a
    // second block on one day is a completion the schema cannot record.
    const parsed = routineSlotsSchema.safeParse([
      slot(0, "07:00", "08:00"),
      slot(0, "19:00", "20:00"),
    ]);

    expect(parsed.success).toBe(false);
  });

  it("takes one block per weekday, up to seven", () => {
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) => slot(day, "09:00", "10:00"));
    expect(routineSlotsSchema.safeParse(week).success).toBe(true);
  });
});

describe("the mask stays authoritative", () => {
  it("refuses a slot on a day the routine does not run", () => {
    // Two sources of truth for "does this run on Saturday" would let the agenda
    // and the home screen disagree about the same task.
    expect(slotsAgreeWithMask([slot(5, "09:00", "10:00")], WEEKDAYS_MASK_WEEKDAYS)).toBe(false);
  });

  it("accepts one on a day it does", () => {
    expect(slotsAgreeWithMask([slot(0, "09:00", "10:00")], WEEKDAYS_MASK_WEEKDAYS)).toBe(true);
    expect(slotsAgreeWithMask([slot(5, "09:00", "10:00")], WEEKDAYS_MASK_ALL)).toBe(true);
  });

  it("is vacuously true for a routine with no times — which is every existing one", () => {
    expect(slotsAgreeWithMask([], WEEKDAYS_MASK_WEEKDAYS)).toBe(true);
  });
});

describe("when two blocks collide", () => {
  it("overlaps only within the same day", () => {
    expect(slotsOverlap(slot(0, "09:00", "10:00"), slot(1, "09:00", "10:00"))).toBe(false);
  });

  it("counts a partial overlap", () => {
    expect(slotsOverlap(slot(0, "09:00", "10:00"), slot(0, "09:30", "11:00"))).toBe(true);
  });

  it("counts one block swallowing another", () => {
    expect(slotsOverlap(slot(0, "09:00", "17:00"), slot(0, "12:00", "13:00"))).toBe(true);
  });

  it("does NOT count back-to-back blocks", () => {
    // Half-open [start, end): ending at 10:00 and starting at 10:00 is exactly
    // what "one after the other" means.
    expect(slotsOverlap(slot(0, "09:00", "10:00"), slot(0, "10:00", "11:00"))).toBe(false);
  });
});

describe("reporting conflicts", () => {
  const gym = { id: "gym", title: "Gym", slots: [slot(0, "12:00", "14:00")] };
  const study = { id: "study", title: "English study", slots: [slot(1, "10:00", "12:00")] };

  it("names what a proposed block runs into", () => {
    const conflicts = findSlotConflicts([slot(0, "13:00", "15:00")], [gym, study]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ withTaskId: "gym", withTaskTitle: "Gym", weekday: 0 });
  });

  it("says nothing when the days differ", () => {
    expect(findSlotConflicts([slot(2, "12:00", "14:00")], [gym, study])).toEqual([]);
  });

  it("does not report a routine against itself while it is being edited", () => {
    // Editing Gym's Monday block must not warn that it collides with Gym.
    expect(findSlotConflicts([slot(0, "12:00", "14:00")], [gym, study], "gym")).toEqual([]);
  });

  it("reports every collision, not just the first", () => {
    const other = { id: "x", title: "Standup", slots: [slot(0, "13:30", "13:45")] };

    expect(findSlotConflicts([slot(0, "12:00", "14:00")], [gym, other])).toHaveLength(2);
  });

  it("is a warning by construction — it returns a list and refuses nothing", () => {
    // Two things at nine on a Monday is a mess a person may knowingly want, and
    // an app that forbids it is an app that gets lied to.
    const conflicts = findSlotConflicts([slot(0, "12:30", "13:00")], [gym]);

    expect(Array.isArray(conflicts)).toBe(true);
    expect(conflicts[0]?.withSlot).toEqual(gym.slots[0]);
  });
});

describe("times as words and back", () => {
  it("reads a clock face", () => {
    expect(minutesToClock(0)).toBe("00:00");
    expect(minutesToClock(540)).toBe("09:00");
    expect(minutesToClock(1439)).toBe("23:59");
    // Midnight-as-an-end reads as 00:00 rather than 24:00; the grid shows it at
    // the bottom of the day either way.
    expect(minutesToClock(1440)).toBe("00:00");
  });

  it("parses exactly what a time input produces", () => {
    expect(clockToMinutes("09:30")).toBe(570);
    expect(clockToMinutes("00:00")).toBe(0);
    expect(clockToMinutes("23:59")).toBe(1439);
  });

  it("refuses anything else", () => {
    for (const bad of ["9:30", "24:00", "12:60", "", "noon", "12:30:00"]) {
      expect(clockToMinutes(bad), bad).toBeNull();
    }
  });

  it("describes a slot the way the agenda says it", () => {
    expect(describeSlot(slot(0, "09:00", "10:30"))).toBe("Mon 09:00–10:30");
    // Monday-first: bit 0 is Monday, and a Sunday-first reading here would name
    // the wrong day while looking entirely plausible.
    expect(describeSlot(slot(6, "08:00", "09:00"))).toBe("Sun 08:00–09:00");
  });
});
