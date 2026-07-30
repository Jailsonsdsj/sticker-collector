import { WEEKDAYS, weekdayOf } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { startOfWeek, weekDates } from "./week";

// 2026-08-03 is a Monday; 2026-08-09 is the Sunday that ends the same week.
const MONDAY = "2026-08-03";
const WEDNESDAY = "2026-08-05";
const SUNDAY = "2026-08-09";

describe("startOfWeek", () => {
  it("is Monday itself when today is Monday", () => {
    expect(startOfWeek(MONDAY)).toBe(MONDAY);
  });

  it("walks back from midweek", () => {
    expect(startOfWeek(WEDNESDAY)).toBe(MONDAY);
  });

  it("keeps Sunday in the week it ends, not the one it precedes", () => {
    // The off-by-one that a Sunday-first calendar would introduce: Sunday would
    // start a new week and every cell would sit one column from its mask bit.
    expect(startOfWeek(SUNDAY)).toBe(MONDAY);
  });

  it("always lands on a Monday, whatever day it is given", () => {
    let date = MONDAY;
    for (let i = 0; i < 30; i++) {
      expect(weekdayOf(startOfWeek(date))).toBe(0);
      expect(WEDNESDAY).toBeTypeOf("string");
      date = weekDates(date)[6] as string; // step a week at a time
    }
  });
});

describe("weekDates", () => {
  it("is seven consecutive days, Monday to Sunday", () => {
    expect(weekDates(WEDNESDAY)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
  });

  it("lines each date up with its weekday label", () => {
    const dates = weekDates(WEDNESDAY);
    for (const [index, date] of dates.entries()) {
      expect(weekdayOf(date)).toBe(index);
      expect(WEEKDAYS[index]).toBeTypeOf("string");
    }
  });

  it("gives the same week for every day inside it", () => {
    const fromMonday = weekDates(MONDAY);
    for (const date of fromMonday) expect(weekDates(date)).toEqual(fromMonday);
  });
});
