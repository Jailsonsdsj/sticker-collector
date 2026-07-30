/**
 * The whole recurrence engine, as pure functions.
 *
 * Two decisions hold this together, and both exist to delete a class of bug:
 *
 * 1. **A day is a civil date string, never a `Date`.** `LocalDate` is
 *    "YYYY-MM-DD". Generation walks the calendar by incrementing a day number,
 *    never by adding 86_400_000 ms — a DST day is 23 or 25 hours, so millisecond
 *    arithmetic silently drifts by a day twice a year. The only function that
 *    consults a timezone at all is `localDateIn`.
 *
 * 2. **Nothing here reads or writes a database.** Occurrences for a window are
 *    computed by walking days and testing the mask (docs/prd/09-data-model.md).
 *    The future is never materialised — see architecture.md §0.3.
 *
 * Status is derived, not stored. An `occurrence` row exists only once a human
 * has done something to it; everything else is computed at read time.
 */

/** A civil date in the user's timezone: "YYYY-MM-DD". Not an instant. */
export type LocalDate = string;

export type OccurrenceStatus = "pending" | "done" | "missed" | "archived";

export type TaskKind = "routine" | "oneoff";

/**
 * Weekday index. **0 is Monday**, 6 is Sunday — ISO 8601 order, matching the
 * weekly grid in the design. Deliberately NOT JavaScript's `Date#getDay()`,
 * where 0 is Sunday. The `weekdays` column is a 7-bit mask over these indices,
 * so bit 0 is Monday and Mon–Fri is 0b0011111 (31).
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Mon–Fri, the mask a five-tap habit produces. */
export const WEEKDAYS_MASK_WEEKDAYS = 0b0011111;
/** Sat + Sun. */
export const WEEKDAYS_MASK_WEEKEND = 0b1100000;
export const WEEKDAYS_MASK_ALL = 0b1111111;
export const WEEKDAYS_MASK_NONE = 0;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 1970-01-01 is day 0 and was a Thursday, which is index 3 in Monday-first. */
const EPOCH_WEEKDAY_OFFSET = 3;

// ── Civil-date arithmetic ────────────────────────────────────────────────────
// days-from-civil / civil-from-days (Howard Hinnant). Exact for the proleptic
// Gregorian calendar, and entirely free of Date, timezones and DST.

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function format(y: number, m: number, d: number): LocalDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/**
 * Parse a LocalDate to its day number. Throws on anything malformed or
 * non-existent — "2025-02-30" round-trips to 2025-03-02, so it is rejected
 * rather than silently accepted.
 */
export function toDayNumber(date: LocalDate): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Not a LocalDate: ${JSON.stringify(date)}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const n = daysFromCivil(y, m, d);
  const back = civilFromDays(n);
  if (back.y !== y || back.m !== m || back.d !== d) {
    throw new RangeError(`No such date: ${date}`);
  }
  return n;
}

export function fromDayNumber(n: number): LocalDate {
  const { y, m, d } = civilFromDays(n);
  return format(y, m, d);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** `to - from`, in whole days. Positive when `to` is later. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** Monday-first weekday of a civil date. */
export function weekdayOf(date: LocalDate): Weekday {
  const n = toDayNumber(date);
  return (((((n % 7) + 7) % 7) + EPOCH_WEEKDAY_OFFSET) % 7) as Weekday;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

// ── Timezone ─────────────────────────────────────────────────────────────────

/**
 * The civil date an instant falls on, in a given IANA timezone. This is the
 * only timezone-aware function in the module; everything downstream is civil
 * arithmetic. Uses `Intl` (present in Node and in workerd), not a dependency.
 */
export function localDateIn(timeZone: string, instant: Date): LocalDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${at("year")}-${at("month")}-${at("day")}`;
}

/** "Today" for the user. Resolved from their timezone, never from the server's. */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  return localDateIn(timeZone, now);
}

// ── The weekday mask ─────────────────────────────────────────────────────────

export function maskHasDay(mask: number, weekday: Weekday): boolean {
  return (mask & (1 << weekday)) !== 0;
}

export function maskFromDays(days: readonly Weekday[]): number {
  return days.reduce<number>((mask, day) => mask | (1 << day), 0);
}

export function daysFromMask(mask: number): Weekday[] {
  const days: Weekday[] = [];
  for (let day = 0; day < 7; day++) {
    if (maskHasDay(mask, day as Weekday)) days.push(day as Weekday);
  }
  return days;
}

export function maskToggleDay(mask: number, weekday: Weekday): number {
  return mask ^ (1 << weekday);
}

// ── Generation ───────────────────────────────────────────────────────────────

export interface RoutineSchedule {
  kind: "routine";
  /** 7-bit mask, bit 0 = Monday. */
  weekdays: number;
  /** Inclusive. Null means "since forever". */
  startsOn?: LocalDate | null;
  /** Inclusive. Null means "until further notice". */
  endsOn?: LocalDate | null;
}

export interface OneOffSchedule {
  kind: "oneoff";
  /**
   * The local date the one-off is due on, already resolved from `due_at` by the
   * caller (use `localDateIn`). Null means undated: backlog only, and it never
   * produces an occurrence.
   */
  dueOn?: LocalDate | null;
}

export type Schedule = RoutineSchedule | OneOffSchedule;

/**
 * Every date in `[from, to]` the schedule lands on. Inclusive at both ends,
 * ascending, never outside the window, and never written anywhere.
 *
 * An undated one-off returns `[]` — it lives in the backlog and has no
 * scheduled day to be missed on.
 */
export function occurrencesInWindow(
  schedule: Schedule,
  from: LocalDate,
  to: LocalDate,
): LocalDate[] {
  const windowStart = toDayNumber(from);
  const windowEnd = toDayNumber(to);
  if (windowEnd < windowStart) return [];

  if (schedule.kind === "oneoff") {
    if (!schedule.dueOn) return [];
    const due = toDayNumber(schedule.dueOn);
    return due >= windowStart && due <= windowEnd ? [schedule.dueOn] : [];
  }

  if ((schedule.weekdays & WEEKDAYS_MASK_ALL) === 0) return [];

  const start = schedule.startsOn
    ? Math.max(windowStart, toDayNumber(schedule.startsOn))
    : windowStart;
  const end = schedule.endsOn ? Math.min(windowEnd, toDayNumber(schedule.endsOn)) : windowEnd;
  if (end < start) return [];

  const dates: LocalDate[] = [];
  for (let n = start; n <= end; n++) {
    const weekday = (((((n % 7) + 7) % 7) + EPOCH_WEEKDAY_OFFSET) % 7) as Weekday;
    if (maskHasDay(schedule.weekdays, weekday)) dates.push(fromDayNumber(n));
  }
  return dates;
}

// ── Status derivation ────────────────────────────────────────────────────────

/** After this many days a missed routine occurrence is archived. */
export const ARCHIVE_AFTER_DAYS = 7;

export interface OccurrenceInput {
  kind: TaskKind;
  scheduledOn: LocalDate;
  /**
   * The row's status, if a row exists at all. Only `done` and `archived` are
   * authoritative — those are the two things a human does. Anything else is
   * recomputed, because `pending` and `missed` are functions of the date.
   */
  storedStatus?: OccurrenceStatus | null;
}

/**
 * architecture.md §0.3, in one function:
 *
 *   stored done                       → done
 *   stored archived                   → archived
 *   scheduled >= today                → pending
 *   today - scheduled in [1, 7]       → missed
 *   today - scheduled > 7, routine    → archived
 *   today - scheduled > 7, dated      → missed   (one-offs never archive)
 */
export function deriveStatus(input: OccurrenceInput, today: LocalDate): OccurrenceStatus {
  if (input.storedStatus === "done") return "done";
  if (input.storedStatus === "archived") return "archived";

  const age = daysBetween(input.scheduledOn, today);
  if (age <= 0) return "pending";
  if (age <= ARCHIVE_AFTER_DAYS) return "missed";
  return input.kind === "routine" ? "archived" : "missed";
}

/**
 * Whether ticking this occurrence is allowed.
 *
 * A future occurrence can never be completed — ticking next month's tasks today
 * would mint coins for work that has not happened (prd/02-tasks.md §Recurrence).
 * An archived one is past correcting. A missed one still pays in full.
 */
export function canComplete(input: OccurrenceInput, today: LocalDate): boolean {
  if (compareDates(input.scheduledOn, today) > 0) return false;
  const status = deriveStatus(input, today);
  return status === "pending" || status === "missed";
}
