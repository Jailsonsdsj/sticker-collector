import { addDays, type LocalDate, weekdayOf } from "@sticker-collector/shared";

/**
 * The Monday of the week containing `today`.
 *
 * Monday-first because bit 0 of the weekday mask is Monday
 * (shared/recurrence.ts). Both weekly grids index that mask, so a week that
 * started on Sunday would put every cell one column away from the bit it
 * controls — and look entirely plausible doing it.
 */
export function startOfWeek(today: LocalDate): LocalDate {
  return addDays(today, -weekdayOf(today));
}

/** The seven dates of that week, Monday through Sunday. */
export function weekDates(today: LocalDate): LocalDate[] {
  const monday = startOfWeek(today);
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));
}
