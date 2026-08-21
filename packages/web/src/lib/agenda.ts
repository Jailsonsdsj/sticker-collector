import type { LocalDate, Occurrence, RoutineSlot, Task, Weekday } from "@sticker-collector/shared";
import { maskHasDay } from "@sticker-collector/shared";

/**
 * The week as an agenda: hours down the side, days across the top.
 *
 * All of the arithmetic lives here rather than in the grid, because placing a
 * block is where this gets subtle — which hour a 09:30 start belongs to, how
 * far a 12:00–14:00 block reaches, what the column shows when nothing is
 * scheduled before noon. None of that needs a DOM to be wrong in.
 */
export interface AgendaBlock {
  task: Task;
  slot: RoutineSlot;
  /** The actual date this block falls on, which is what a completion needs. */
  date: LocalDate;
  done: boolean;
}

/** Only routines with times appear. Everything created before the agenda has
 *  none, and a block with no hour has nowhere to go. */
export function scheduledRoutines(tasks: readonly Task[]): Task[] {
  return tasks.filter(
    (task) => task.type === "routine" && !task.deletedAt && task.slots.length > 0,
  );
}

/**
 * The hours the column has to show: the earliest start, floored, to the latest
 * end, ceilinged.
 *
 * Derived rather than fixed at 00–23, so a person whose day starts at six is
 * not scrolling past six empty rows to reach it. Null when nothing is
 * scheduled at all — the caller shows an empty state instead of an empty grid.
 */
export function agendaHours(routines: readonly Task[]): { from: number; to: number } | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;

  for (const task of routines) {
    for (const slot of task.slots) {
      from = Math.min(from, Math.floor(slot.startMin / 60));
      // A block ending at 14:00 occupies up to the 13:00 row; one ending at
      // 14:30 needs the 14:00 row as well.
      to = Math.max(to, Math.ceil(slot.endMin / 60));
    }
  }

  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // `to` is always at least `from + 1`: a slot's end is later than its start,
  // so flooring one and ceiling the other cannot meet. No clamp needed.
  return { from, to };
}

/** `[6, 7, 8 …]` — the rows of the hour column. */
export function hourRows(range: { from: number; to: number }): number[] {
  return Array.from({ length: range.to - range.from }, (_, i) => range.from + i);
}

/**
 * Every block of the week, in the order they should be read.
 *
 * `dates` is the seven days the week grid covers, Monday-first, so a block
 * carries the real date it falls on — a completion is keyed by date, and
 * deriving it later from a weekday is how a week grid ticks the wrong day.
 */
export function agendaBlocks(
  routines: readonly Task[],
  dates: readonly LocalDate[],
  occurrences: readonly Occurrence[],
): AgendaBlock[] {
  const doneKeys = new Set(
    occurrences.filter((o) => o.status === "done").map((o) => `${o.taskId} ${o.scheduledOn}`),
  );

  const blocks: AgendaBlock[] = [];
  for (const task of routines) {
    for (const slot of task.slots) {
      // The mask still decides whether it runs; a slot only says when. A slot
      // left behind on a day the mask no longer covers must not appear.
      if (!maskHasDay(task.weekdays ?? 0, slot.weekday as Weekday)) continue;

      const date = dates[slot.weekday];
      if (!date) continue;

      blocks.push({ task, slot, date, done: doneKeys.has(`${task.id} ${date}`) });
    }
  }

  return blocks.sort(
    (a, b) => a.slot.weekday - b.slot.weekday || a.slot.startMin - b.slot.startMin,
  );
}

/** The blocks for one day, earliest first. Generic so a laned list stays
 *  laned — narrowing to `AgendaBlock` here would drop the lane silently. */
export function blocksOn<T extends AgendaBlock>(blocks: readonly T[], weekday: Weekday): T[] {
  return blocks.filter((block) => block.slot.weekday === weekday);
}

/** A block, plus which of its day's parallel columns it belongs in. */
export interface PlacedBlock extends AgendaBlock {
  /** 0-based column within the overlapping group. */
  lane: number;
  /** How many columns that group needs. 1 when nothing overlaps. */
  lanes: number;
}

/**
 * Side by side, not on top of each other.
 *
 * Two slots at the same hour on the same day are the same grid cell, and grid
 * items sharing a cell stack — the later one simply covers the earlier, so a
 * task disappears from the day it was scheduled on. Saving a new clash is
 * refused now, but the rule cannot reach data that already exists, and a task
 * you cannot see is a task you cannot fix.
 *
 * The usual calendar layout: a run of blocks that transitively overlap forms a
 * group, each block takes the first free column in it, and the group's width is
 * split between the columns it needed. A day with no clashes is untouched —
 * every block gets `lanes: 1` and the full width.
 */
export function laneOut(blocks: readonly AgendaBlock[]): PlacedBlock[] {
  const placed: PlacedBlock[] = [];

  for (const weekday of new Set(blocks.map((block) => block.slot.weekday))) {
    const day = blocks
      .filter((block) => block.slot.weekday === weekday)
      .sort((a, b) => a.slot.startMin - b.slot.startMin || a.slot.endMin - b.slot.endMin);

    // One group at a time, flushed when a block starts after everything so far
    // has ended — that gap is what makes the next run independent of this one.
    let group: PlacedBlock[] = [];
    let laneEnds: number[] = [];

    const flush = () => {
      for (const block of group) block.lanes = laneEnds.length;
      placed.push(...group);
      group = [];
      laneEnds = [];
    };

    for (const block of day) {
      if (laneEnds.length > 0 && block.slot.startMin >= Math.max(...laneEnds)) flush();

      // The first column already free at this minute. Half-open, so a block
      // starting exactly when another ends reuses its column.
      let lane = laneEnds.findIndex((end) => end <= block.slot.startMin);
      if (lane === -1) lane = laneEnds.length;

      laneEnds[lane] = block.slot.endMin;
      group.push({ ...block, lane, lanes: 1 });
    }
    flush();
  }

  return placed.sort(
    (a, b) => a.slot.weekday - b.slot.weekday || a.slot.startMin - b.slot.startMin,
  );
}

/**
 * Where the "now" line goes: which hour row, and how far down it.
 *
 * Per row rather than as a fraction of the whole grid, because the rows are
 * `minmax(2.75rem, auto)` — a row holding a two-line block is taller than an
 * empty one, so a single offset down the total height lands the line at the
 * wrong time exactly when the grid is busiest. Null when now is outside the
 * hours on screen.
 */
export function nowMarker(
  range: { from: number; to: number },
  minutesNow: number,
): { hour: number; fraction: number } | null {
  const hour = Math.floor(minutesNow / 60);
  if (hour < range.from || hour >= range.to) return null;
  return { hour, fraction: (minutesNow % 60) / 60 };
}

/** Minutes since midnight, in the app's own timezone. */
export function minutesNowIn(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    // h23, spelled out: the h24 cycle writes midnight as "24:00", which reads as
    // the end of the day and would put the marker off the bottom of the grid.
    // `hour12: false` alone leaves the choice to the engine's locale data.
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Is this block happening right now? Used to mark the block itself, which is
 * the thing being looked for.
 *
 * The date, not the weekday: the grid can be showing any week, and a Monday
 * block in next week's grid is not running because today is a Monday.
 */
export function isNow(block: AgendaBlock, today: LocalDate, minutesNow: number): boolean {
  return (
    block.date === today && minutesNow >= block.slot.startMin && minutesNow < block.slot.endMin
  );
}

/**
 * Which hour the grid should open on: now, or the first thing scheduled.
 *
 * A day that runs 07:00–22:00 is fifteen rows and may hold three blocks.
 * Opening at the top means scrolling past an empty morning to find either what
 * is happening now — the question this tab exists to answer — or, on a day that
 * is not today, anything at all. Null when there is nothing to open on.
 */
export function openingHour(
  marker: { hour: number } | null,
  blocks: readonly AgendaBlock[],
): number | null {
  if (marker) return marker.hour;
  const first = blocks[0];
  return first ? Math.floor(first.slot.startMin / 60) : null;
}
