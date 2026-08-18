import type { EpicAccent, LocalDate, Weekday } from "@sticker-collector/shared";
import { WEEKDAYS, weekdayOf } from "@sticker-collector/shared";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../ui/cx";

/**
 * The chrome both weekly grids share: the `80px + 7 columns` layout, the day
 * headers, and the row label.
 *
 * It exists so **Monday-first lives in one place**. Two screens index the same
 * weekday mask, and a column order that drifted on one of them would look
 * entirely correct while pointing at the wrong bit.
 */
export function WeekGridShell({
  today,
  rows,
  children,
}: {
  today: LocalDate;
  /** How many task rows follow the header. The column outline spans them, and
   *  `grid-row: 1 / -1` only reaches the end of the EXPLICIT grid — with rows
   *  left implicit it covered the header alone and pushed every column along by
   *  one, which no jsdom test can see and one screenshot showed immediately. */
  rows: number;
  children: ReactNode;
}) {
  const todayIndex = weekdayOf(today);

  return (
    <div
      className="relative grid grid-cols-[5rem_repeat(7,1fr)] items-center gap-1"
      style={{ gridTemplateRows: `repeat(${rows + 1}, auto)` }}
    >
      {/* Today, as one continuous outline around the whole column.
          It used to be a ring on each checkbox: seven small halos down a
          column read as seven separate states rather than one day, and the
          question people actually had — "is this row's box for TODAY?" — took
          counting. Drawn in the grid rather than over it, spanning every row
          including the header, so it lines up with the cells by construction
          instead of by arithmetic. */}
      <span
        aria-hidden
        // **Absolutely** positioned, and that is the whole trick. A grid child
        // with a definite area still occupies those cells, so the auto-placed
        // header and checkboxes flowed around it and every column shifted by
        // one. Out of flow it keeps the grid area for its geometry and takes no
        // cell — which is what an overlay is.
        className="pointer-events-none absolute -inset-1 rounded-lg border-2 border-ring-today"
        // BOTH lines, on both axes. For an absolutely positioned grid child an
        // `auto` end line resolves to the container's padding edge, not to
        // "span one" — so a bare `gridColumn: 5` stretched the outline from
        // Thursday to Sunday.
        style={{
          gridColumn: `${todayIndex + 2} / ${todayIndex + 3}`,
          gridRow: `1 / ${rows + 2}`,
        }}
      />
      <span />
      {WEEKDAYS.map((day, index) => (
        <span
          key={day}
          className={cx(
            "text-center font-numeric text-2xs font-bold",
            index === todayIndex ? "text-cyan" : "text-ink-muted",
          )}
        >
          {day.slice(0, 2).toUpperCase()}
        </span>
      ))}
      {children}
    </div>
  );
}

/** A row's leading cell: the task's title, its epic's colour, and what it pays. */
export function WeekRowLabel({
  title,
  rewardCoins,
  epicAccent,
}: {
  title: string;
  rewardCoins: number;
  /** Null for a task with no epic — the edge falls back to the neutral one. */
  epicAccent?: EpicAccent | null;
}) {
  return (
    <div
      // The same left edge the home screen's rows wear, so an epic reads as the
      // same colour wherever its tasks appear.
      style={{ "--ui-epic": `var(--color-${epicAccent ?? "epic-none"})` } as CSSProperties}
      className="min-w-0 border-l-[3px] py-2 pl-2 [border-left-color:var(--ui-epic)]"
    >
      {/* Wraps rather than truncates. The column is narrow, so a truncated
          title routinely hid the word that told two routines apart — a taller
          row is a cheaper price than an unreadable one. `break-words` covers
          the single long word that would otherwise overflow the column. */}
      <div className="font-body text-sm font-semibold break-words">{title}</div>
      <div className="font-numeric text-2xs font-bold text-coin">+{rewardCoins}</div>
    </div>
  );
}

/** Weekday indices in render order, so a caller never writes 0..6 by hand. */
export const WEEKDAY_INDICES = WEEKDAYS.map((_, index) => index as Weekday);
