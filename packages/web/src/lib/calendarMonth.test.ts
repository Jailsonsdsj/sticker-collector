import { describe, expect, it } from "vitest";
import { addMonth, clampMonth, monthLabel, monthOf } from "./calendarMonth";

describe("stepping a month", () => {
  it("lands on the first of the next month", () => {
    expect(addMonth("2026-07", 1)).toBe("2026-08-01");
  });

  it("carries across a year boundary in both directions", () => {
    // The reason `Date` does the arithmetic rather than string maths: month 12
    // is month 0 of the next year, and month -1 is December of the last.
    expect(addMonth("2026-12", 1)).toBe("2027-01-01");
    expect(addMonth("2026-01", -1)).toBe("2025-12-01");
  });

  it("knows how long February is", () => {
    // 2028 is a leap year; 2027 is not. A calendar that draws 28 cells in a
    // leap February silently loses a day.
    expect(addMonth("2028-02", 1)).toBe("2028-03-01");
    expect(addMonth("2027-02", 1)).toBe("2027-03-01");
  });
});

describe("clamping to a range", () => {
  it("holds a month inside the history", () => {
    expect(clampMonth("2025-01", "2026-01", "2026-12")).toBe("2026-01");
    expect(clampMonth("2027-05", "2026-01", "2026-12")).toBe("2026-12");
    expect(clampMonth("2026-06", "2026-01", "2026-12")).toBe("2026-06");
  });

  it("compares months chronologically, which is what the format buys", () => {
    // `YYYY-MM` sorts lexicographically exactly as it sorts in time — the
    // reason none of this needs parsing.
    expect(clampMonth("2026-09", "2026-01", "2026-10")).toBe("2026-09");
    expect(["2026-10", "2026-09", "2026-01"].sort()).toEqual(["2026-01", "2026-09", "2026-10"]);
  });
});

describe("naming a month", () => {
  it("reads as a person would say it", () => {
    expect(monthLabel("2026-07")).toBe("July 2026");
    expect(monthLabel("2026-01")).toBe("January 2026");
    expect(monthLabel("2026-12")).toBe("December 2026");
  });

  it("takes a month off a full date", () => {
    expect(monthOf("2026-07-27")).toBe("2026-07");
  });
});
