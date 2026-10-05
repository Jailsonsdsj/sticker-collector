import type { EpicAccent, Weekday } from "@sticker-collector/shared";
import { WEEKDAYS } from "@sticker-collector/shared";
import type { CSSProperties, ReactNode } from "react";

/**
 * The weekly grid's chrome: the `80px + 7 columns` layout, the day headers,
 * and the row label. Used by the week report.
 *
 * It exists so **Monday-first lives in one place**. The mask's bit 0 is
 * Monday, and a column order that drifted would look entirely correct while
 * pointing at the wrong day.
 */
export function WeekGridShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_repeat(7,1fr)] items-center gap-1">
      <span />
      {WEEKDAYS.map((day) => (
        <span key={day} className="text-center font-numeric text-2xs font-bold text-ink-muted">
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
  /** Omitted where the row is a record rather than an offer — a week report. */
  rewardCoins?: number;
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
      {rewardCoins !== undefined && (
        <div className="font-numeric text-2xs font-bold text-coin">+{rewardCoins}</div>
      )}
    </div>
  );
}

/** Weekday indices in render order, so a caller never writes 0..6 by hand. */
export const WEEKDAY_INDICES = WEEKDAYS.map((_, index) => index as Weekday);
