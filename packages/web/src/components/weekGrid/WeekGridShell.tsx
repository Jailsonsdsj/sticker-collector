import type { LocalDate, Weekday } from "@sticker-collector/shared";
import { WEEKDAYS, weekdayOf } from "@sticker-collector/shared";
import type { ReactNode } from "react";
import { cx } from "../ui/cx";

/**
 * The chrome both weekly grids share: the `80px + 7 columns` layout, the day
 * headers, and the row label.
 *
 * It exists so **Monday-first lives in one place**. Two screens index the same
 * weekday mask, and a column order that drifted on one of them would look
 * entirely correct while pointing at the wrong bit.
 */
export function WeekGridShell({ today, children }: { today: LocalDate; children: ReactNode }) {
  const todayIndex = weekdayOf(today);

  return (
    <div className="grid grid-cols-[5rem_repeat(7,1fr)] items-center gap-1">
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

/** A row's leading cell: the task's title and what it pays. */
export function WeekRowLabel({ title, rewardCoins }: { title: string; rewardCoins: number }) {
  return (
    <div className="min-w-0 border-l-[3px] border-l-epic-none py-2 pl-2">
      <div className="truncate font-body text-sm font-semibold">{title}</div>
      <div className="font-numeric text-2xs font-bold text-coin">+{rewardCoins}</div>
    </div>
  );
}

/** Weekday indices in render order, so a caller never writes 0..6 by hand. */
export const WEEKDAY_INDICES = WEEKDAYS.map((_, index) => index as Weekday);
