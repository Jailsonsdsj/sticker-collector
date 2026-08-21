import { z } from "zod";
import { maskHasDay, WEEKDAYS, type Weekday } from "./recurrence";

/**
 * When a routine runs, as opposed to whether it runs.
 *
 * **The weekday mask stays authoritative.** A slot says at what hour a routine
 * happens on a day the mask already includes; it never adds a day. Two sources
 * of truth for "does this run on Tuesday" would let the agenda and the home
 * screen disagree about the same task, silently — the mask is the one the
 * occurrence generator and the reports histogram already read.
 *
 * **Wall-clock minutes from midnight, never an instant.** 18:00 means 18:00
 * wherever the user is; storing a UTC timestamp would move every block on the
 * agenda when the profile's timezone changed, which is the whole TD-31 class of
 * bug over again.
 *
 * **One slot per weekday.** `occurrence` is unique on (task, date) and the coin
 * ledger hangs off that pair, so a second block on the same day would be a
 * completion the schema cannot record. Two blocks a day is a real want; it is
 * also a migration through an append-only table, and it is not this task.
 */
export const MINUTES_IN_DAY = 24 * 60;

export const routineSlotSchema = z
  .strictObject({
    weekday: z.int().min(0).max(6),
    /** Inclusive, 00:00 = 0. */
    startMin: z
      .int()
      .min(0)
      .max(MINUTES_IN_DAY - 1),
    /** Exclusive, so 23:00–24:00 is the last hour of the day. */
    endMin: z.int().min(1).max(MINUTES_IN_DAY),
  })
  .refine((slot) => slot.endMin > slot.startMin, {
    message: "a slot must end after it starts",
    path: ["endMin"],
  });

export type RoutineSlot = z.infer<typeof routineSlotSchema>;

/**
 * The whole set for one routine.
 *
 * Overnight is refused rather than split: 22:00 → 01:00 is two blocks on two
 * days, and inventing the second one silently would put a task on a Tuesday the
 * user never chose. The form can offer to split it later; the model should not
 * guess.
 */
export const routineSlotsSchema = z
  .array(routineSlotSchema)
  .max(7)
  .refine((slots) => new Set(slots.map((slot) => slot.weekday)).size === slots.length, {
    message: "one slot per weekday",
  });

/** Slots for a day the mask does not include are the disagreement this rule
 *  exists to prevent. */
export function slotsAgreeWithMask(slots: readonly RoutineSlot[], mask: number): boolean {
  return slots.every((slot) => maskHasDay(mask, slot.weekday as Weekday));
}

/** Half-open [start, end): a block ending at 10:00 and one starting at 10:00 do
 *  not overlap, which is what back-to-back means. */
export function slotsOverlap(a: RoutineSlot, b: RoutineSlot): boolean {
  return a.weekday === b.weekday && a.startMin < b.endMin && b.startMin < a.endMin;
}

export interface SlotConflict {
  weekday: Weekday;
  /** The slot being placed. */
  slot: RoutineSlot;
  /** What it runs into. */
  withTaskId: string;
  withTaskTitle: string;
  withSlot: RoutineSlot;
}

/**
 * What a proposed set of slots would collide with.
 *
 * A **warning**, never a refusal: two things at nine on a Monday is a mess a
 * person may knowingly want, and an app that forbids it is an app that gets
 * lied to. The caller decides what to do with the list.
 *
 * `exceptTaskId` is how editing a routine avoids reporting it against itself.
 */
export function findSlotConflicts(
  slots: readonly RoutineSlot[],
  others: readonly { id: string; title: string; slots: readonly RoutineSlot[] }[],
  exceptTaskId?: string,
): SlotConflict[] {
  const conflicts: SlotConflict[] = [];

  for (const slot of slots) {
    for (const other of others) {
      if (other.id === exceptTaskId) continue;
      for (const otherSlot of other.slots) {
        if (!slotsOverlap(slot, otherSlot)) continue;
        conflicts.push({
          weekday: slot.weekday as Weekday,
          slot,
          withTaskId: other.id,
          withTaskTitle: other.title,
          withSlot: otherSlot,
        });
      }
    }
  }

  return conflicts;
}

/** `540` → `"09:00"`. 24-hour, because the agenda is a grid and a column of
 *  "9:00 AM" is a column of ragged widths. */
export function minutesToClock(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** `"09:30"` → `570`, or null if it is not a time. Accepts what an
 *  `<input type="time">` produces, which is exactly `HH:MM`. */
export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** "Mon 09:00–10:30" — one slot, in the words the agenda uses. */
export function describeSlot(slot: RoutineSlot): string {
  return `${WEEKDAYS[slot.weekday]} ${minutesToClock(slot.startMin)}–${minutesToClock(slot.endMin)}`;
}
