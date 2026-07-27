import { describe, expect, it } from "vitest";
import {
  ARCHIVE_AFTER_DAYS,
  addDays,
  canComplete,
  daysBetween,
  daysFromMask,
  deriveStatus,
  type LocalDate,
  localDateIn,
  maskFromDays,
  maskHasDay,
  maskToggleDay,
  occurrencesInWindow,
  toDayNumber,
  todayIn,
  WEEKDAYS,
  WEEKDAYS_MASK_WEEKDAYS,
  WEEKDAYS_MASK_WEEKEND,
  type Weekday,
  weekdayOf,
} from "./recurrence.js";

const MON = 0 as Weekday;
const SAT = 5 as Weekday;
const SUN = 6 as Weekday;

describe("the weekday mask", () => {
  it("indexes Monday as 0 and Sunday as 6", () => {
    // 2025-07-28 is a Monday. Anchor the whole convention on a known week.
    expect(weekdayOf("2025-07-28")).toBe(0);
    expect(weekdayOf("2025-07-29")).toBe(1);
    expect(weekdayOf("2025-07-30")).toBe(2);
    expect(weekdayOf("2025-07-31")).toBe(3);
    expect(weekdayOf("2025-08-01")).toBe(4);
    expect(weekdayOf("2025-08-02")).toBe(5);
    expect(weekdayOf("2025-08-03")).toBe(6);
    expect(WEEKDAYS[0]).toBe("Mon");
    expect(WEEKDAYS[6]).toBe("Sun");
  });

  it("puts Monday in bit 0, so Mon–Fri is 31", () => {
    expect(WEEKDAYS_MASK_WEEKDAYS).toBe(0b0011111);
    expect(WEEKDAYS_MASK_WEEKDAYS).toBe(31);
    expect(maskFromDays([0, 1, 2, 3, 4] as Weekday[])).toBe(WEEKDAYS_MASK_WEEKDAYS);
    expect(maskHasDay(WEEKDAYS_MASK_WEEKDAYS, MON)).toBe(true);
    expect(maskHasDay(WEEKDAYS_MASK_WEEKDAYS, SAT)).toBe(false);
    expect(maskHasDay(WEEKDAYS_MASK_WEEKDAYS, SUN)).toBe(false);
  });

  it("represents Sat-only and Sat+Sun", () => {
    expect(maskFromDays([SAT])).toBe(0b0100000);
    expect(maskFromDays([SAT, SUN])).toBe(WEEKDAYS_MASK_WEEKEND);
    expect(daysFromMask(WEEKDAYS_MASK_WEEKEND)).toEqual([SAT, SUN]);
  });

  it("round-trips every mask", () => {
    for (let mask = 0; mask < 128; mask++) {
      expect(maskFromDays(daysFromMask(mask))).toBe(mask);
    }
  });

  it("toggles one day at a time — the weekly grid's only edit", () => {
    let mask = 0;
    for (const day of [MON, 1, 2, 3, 4] as Weekday[]) mask = maskToggleDay(mask, day);
    expect(mask).toBe(WEEKDAYS_MASK_WEEKDAYS);
    expect(maskToggleDay(mask, MON)).toBe(0b0011110);
  });
});

describe("civil-date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2025-03-01", -1)).toBe("2025-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29"); // leap year
  });

  it("measures whole days, signed", () => {
    expect(daysBetween("2025-07-01", "2025-07-08")).toBe(7);
    expect(daysBetween("2025-07-08", "2025-07-01")).toBe(-7);
    expect(daysBetween("2025-07-01", "2025-07-01")).toBe(0);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // leap
    expect(daysBetween("2025-02-28", "2025-03-01")).toBe(1); // not leap
  });

  it("rejects malformed and non-existent dates instead of guessing", () => {
    expect(() => toDayNumber("2025-7-1")).toThrow(RangeError);
    expect(() => toDayNumber("not a date")).toThrow(RangeError);
    expect(() => toDayNumber("2025-02-30")).toThrow(RangeError);
    expect(() => toDayNumber("2025-13-01")).toThrow(RangeError);
    expect(() => toDayNumber("2025-02-29")).toThrow(RangeError); // 2025 is not leap
    expect(toDayNumber("2024-02-29")).toBeTypeOf("number"); // 2024 is
  });
});

describe("todayIn — the user's timezone, never the server's", () => {
  it("resolves the same instant to different calendar days across the date line", () => {
    // 2025-07-27T11:00Z: already the 28th in Kiritimati (+14), still the 27th
    // in Niue (-11). Two calendar days apart from one instant.
    const instant = new Date("2025-07-27T11:00:00Z");
    expect(localDateIn("Pacific/Kiritimati", instant)).toBe("2025-07-28");
    expect(localDateIn("UTC", instant)).toBe("2025-07-27");
    expect(localDateIn("Pacific/Niue", instant)).toBe("2025-07-27");

    const later = new Date("2025-07-27T23:00:00Z");
    expect(localDateIn("Pacific/Kiritimati", later)).toBe("2025-07-28");
    expect(localDateIn("UTC", later)).toBe("2025-07-27");
    expect(localDateIn("Pacific/Niue", later)).toBe("2025-07-27");
  });

  it("rolls over at local midnight, not UTC midnight", () => {
    // São Paulo is UTC-3 and has had no DST since 2019.
    expect(localDateIn("America/Sao_Paulo", new Date("2025-07-28T02:59:59Z"))).toBe("2025-07-27");
    expect(localDateIn("America/Sao_Paulo", new Date("2025-07-28T03:00:00Z"))).toBe("2025-07-28");
  });

  it("todayIn is localDateIn at now", () => {
    const now = new Date("2025-07-27T11:00:00Z");
    expect(todayIn("Pacific/Kiritimati", now)).toBe(localDateIn("Pacific/Kiritimati", now));
  });
});

describe("occurrencesInWindow — routines", () => {
  const monFri = { kind: "routine", weekdays: WEEKDAYS_MASK_WEEKDAYS } as const;

  it("generates a Mon–Fri routine over a fortnight, skipping weekends", () => {
    // 2025-07-28 is a Monday.
    expect(occurrencesInWindow(monFri, "2025-07-28", "2025-08-10")).toEqual([
      "2025-07-28",
      "2025-07-29",
      "2025-07-30",
      "2025-07-31",
      "2025-08-01",
      "2025-08-04",
      "2025-08-05",
      "2025-08-06",
      "2025-08-07",
      "2025-08-08",
    ]);
  });

  it("generates a Sat-only routine", () => {
    const satOnly = { kind: "routine", weekdays: maskFromDays([SAT]) } as const;
    expect(occurrencesInWindow(satOnly, "2025-07-28", "2025-08-17")).toEqual([
      "2025-08-02",
      "2025-08-09",
      "2025-08-16",
    ]);
  });

  it("generates Sat+Sun", () => {
    const weekend = { kind: "routine", weekdays: WEEKDAYS_MASK_WEEKEND } as const;
    expect(occurrencesInWindow(weekend, "2025-07-28", "2025-08-03")).toEqual([
      "2025-08-02",
      "2025-08-03",
    ]);
  });

  it("never returns a date outside the window", () => {
    const dates = occurrencesInWindow(monFri, "2025-07-30", "2025-08-01");
    expect(dates).toEqual(["2025-07-30", "2025-07-31", "2025-08-01"]);
  });

  it("clips to startsOn and endsOn", () => {
    const bounded = {
      kind: "routine",
      weekdays: WEEKDAYS_MASK_WEEKDAYS,
      startsOn: "2025-07-30",
      endsOn: "2025-08-05",
    } as const;
    expect(occurrencesInWindow(bounded, "2025-07-28", "2025-08-10")).toEqual([
      "2025-07-30",
      "2025-07-31",
      "2025-08-01",
      "2025-08-04",
      "2025-08-05",
    ]);
  });

  it("returns nothing when the bounds or the window are inverted", () => {
    const backwards = {
      kind: "routine",
      weekdays: WEEKDAYS_MASK_WEEKDAYS,
      startsOn: "2025-08-05",
      endsOn: "2025-07-30",
    } as const;
    expect(occurrencesInWindow(backwards, "2025-07-28", "2025-08-10")).toEqual([]);
    expect(occurrencesInWindow(monFri, "2025-08-10", "2025-07-28")).toEqual([]);
  });

  it("returns nothing for an empty mask", () => {
    expect(
      occurrencesInWindow({ kind: "routine", weekdays: 0 }, "2025-07-28", "2025-08-10"),
    ).toEqual([]);
  });

  it("includes both ends of the window", () => {
    expect(occurrencesInWindow(monFri, "2025-07-28", "2025-07-28")).toEqual(["2025-07-28"]);
  });
});

describe("occurrencesInWindow — DST cannot shift a civil date", () => {
  const daily = { kind: "routine", weekdays: 0b1111111 } as const;

  it("spring forward: Europe/London, 30 March 2025 (a 23-hour day)", () => {
    const dates = occurrencesInWindow(daily, "2025-03-28", "2025-04-01");
    expect(dates).toEqual(["2025-03-28", "2025-03-29", "2025-03-30", "2025-03-31", "2025-04-01"]);
    expect(new Set(dates).size).toBe(dates.length); // no duplicate
  });

  it("fall back: America/New_York, 2 November 2025 (a 25-hour day)", () => {
    const dates = occurrencesInWindow(daily, "2025-10-31", "2025-11-04");
    expect(dates).toEqual(["2025-10-31", "2025-11-01", "2025-11-02", "2025-11-03", "2025-11-04"]);
  });

  it("a Mon–Fri routine crossing a DST change loses and gains nothing", () => {
    const monFri = { kind: "routine", weekdays: WEEKDAYS_MASK_WEEKDAYS } as const;
    // 2025-11-02 is the US fall-back Sunday; the week around it is untouched.
    expect(occurrencesInWindow(monFri, "2025-10-27", "2025-11-07")).toEqual([
      "2025-10-27",
      "2025-10-28",
      "2025-10-29",
      "2025-10-30",
      "2025-10-31",
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
    ]);
  });

  it("day arithmetic across a DST change stays whole", () => {
    // Millisecond arithmetic would give 6.958… or 7.042 days here.
    expect(daysBetween("2025-03-27", "2025-04-03")).toBe(7);
    expect(daysBetween("2025-10-30", "2025-11-06")).toBe(7);
  });
});

describe("occurrencesInWindow — one-offs", () => {
  it("emits a dated one-off exactly once, inside the window", () => {
    const dated = { kind: "oneoff", dueOn: "2025-08-05" } as const;
    expect(occurrencesInWindow(dated, "2025-07-28", "2025-08-10")).toEqual(["2025-08-05"]);
    expect(occurrencesInWindow(dated, "2025-08-05", "2025-08-05")).toEqual(["2025-08-05"]);
    expect(occurrencesInWindow(dated, "2025-08-06", "2025-08-10")).toEqual([]);
  });

  it("never emits an undated one-off — it lives in the backlog", () => {
    expect(occurrencesInWindow({ kind: "oneoff" }, "2020-01-01", "2030-01-01")).toEqual([]);
    expect(
      occurrencesInWindow({ kind: "oneoff", dueOn: null }, "2020-01-01", "2030-01-01"),
    ).toEqual([]);
  });
});

describe("deriveStatus", () => {
  const today: LocalDate = "2025-07-28";
  const routine = (scheduledOn: LocalDate, storedStatus?: "done" | "archived") =>
    deriveStatus({ kind: "routine", scheduledOn, storedStatus }, today);
  const oneoff = (scheduledOn: LocalDate) => deriveStatus({ kind: "oneoff", scheduledOn }, today);

  it("is pending today and in the future", () => {
    expect(routine(today)).toBe("pending");
    expect(routine(addDays(today, 1))).toBe("pending");
    expect(routine(addDays(today, 30))).toBe("pending");
  });

  it("is missed from day 1 through day 7", () => {
    expect(routine(addDays(today, -1))).toBe("missed");
    expect(routine(addDays(today, -ARCHIVE_AFTER_DAYS))).toBe("missed");
    expect(ARCHIVE_AFTER_DAYS).toBe(7);
  });

  it("archives a routine on day 8", () => {
    expect(routine(addDays(today, -8))).toBe("archived");
    expect(routine(addDays(today, -365))).toBe("archived");
  });

  it("never archives a dated one-off — it persists until done or deleted", () => {
    expect(oneoff(addDays(today, -1))).toBe("missed");
    expect(oneoff(addDays(today, -7))).toBe("missed");
    expect(oneoff(addDays(today, -8))).toBe("missed");
    expect(oneoff(addDays(today, -3650))).toBe("missed");
  });

  it("lets a stored done or archived win over the derived value", () => {
    expect(routine(addDays(today, -100), "done")).toBe("done");
    expect(routine(today, "done")).toBe("done");
    expect(routine(addDays(today, 5), "done")).toBe("done");
    expect(routine(addDays(today, -1), "archived")).toBe("archived");
  });

  it("recomputes a stored pending or missed, because both are functions of the date", () => {
    expect(
      deriveStatus(
        { kind: "routine", scheduledOn: addDays(today, -9), storedStatus: "pending" },
        today,
      ),
    ).toBe("archived");
    expect(
      deriveStatus({ kind: "routine", scheduledOn: today, storedStatus: "missed" }, today),
    ).toBe("pending");
  });
});

describe("canComplete", () => {
  const today: LocalDate = "2025-07-28";

  it("refuses a future occurrence — coins are never minted early", () => {
    expect(canComplete({ kind: "routine", scheduledOn: addDays(today, 1) }, today)).toBe(false);
    expect(canComplete({ kind: "routine", scheduledOn: addDays(today, 30) }, today)).toBe(false);
    expect(canComplete({ kind: "oneoff", scheduledOn: addDays(today, 1) }, today)).toBe(false);
  });

  it("allows today", () => {
    expect(canComplete({ kind: "routine", scheduledOn: today }, today)).toBe(true);
  });

  it("allows a missed occurrence — it still pays in full", () => {
    expect(canComplete({ kind: "routine", scheduledOn: addDays(today, -1) }, today)).toBe(true);
    expect(canComplete({ kind: "routine", scheduledOn: addDays(today, -7) }, today)).toBe(true);
  });

  it("refuses an archived routine", () => {
    expect(canComplete({ kind: "routine", scheduledOn: addDays(today, -8) }, today)).toBe(false);
  });

  it("still allows a long-overdue one-off, which never archives", () => {
    expect(canComplete({ kind: "oneoff", scheduledOn: addDays(today, -365) }, today)).toBe(true);
  });

  it("refuses one that is already done", () => {
    expect(canComplete({ kind: "routine", scheduledOn: today, storedStatus: "done" }, today)).toBe(
      false,
    );
  });
});
