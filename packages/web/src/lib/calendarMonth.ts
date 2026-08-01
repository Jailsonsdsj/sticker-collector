import type { LocalDate } from "@sticker-collector/shared";

/**
 * Month arithmetic on `YYYY-MM` strings.
 *
 * Kept out of the calendar component for the same reason the swipe rules are:
 * the fiddly parts are decisions about dates — what "one month on" means in
 * December, which month a range is clamped to — and those are far easier to
 * prove without a rendered grid in the way.
 *
 * Months are **compared as strings**, which `YYYY-MM` makes safe: it sorts
 * lexicographically exactly as it sorts chronologically.
 */
export type CalendarMonth = string;

export function monthOf(date: string): CalendarMonth {
  return date.slice(0, 7);
}

/** The first of the month, `n` months along.
 *
 * `Date` does the carry, which is the whole reason it is here: month 12 of one
 * year is month 0 of the next, and February is whatever length it is that
 * year. */
export function addMonth(month: CalendarMonth, n: number): LocalDate {
  const shifted = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n));
  return shifted.toISOString().slice(0, 10) as LocalDate;
}

export function clampMonth(
  month: CalendarMonth,
  low: CalendarMonth,
  high: CalendarMonth,
): CalendarMonth {
  if (month < low) return low;
  if (month > high) return high;
  return month;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(month: CalendarMonth): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}
