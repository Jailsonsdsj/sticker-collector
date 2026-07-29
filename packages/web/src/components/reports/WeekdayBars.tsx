import type { WeekdayShape } from "@sticker-collector/shared";

export interface WeekdayBarsProps {
  weekdays: readonly WeekdayShape[];
}

/**
 * Completion rate by day of week — the view that surfaces the honest pattern
 * (*Mondays hold, Fridays collapse*).
 *
 * Rendered in the order the API sends, which is **Monday-first**: the mask's bit
 * 0 is Monday and the weekly grid agrees. Re-sorting this list is how the
 * histogram silently rotates by a day.
 */
export function WeekdayBars({ weekdays }: WeekdayBarsProps) {
  return (
    <ul className="flex flex-col gap-1">
      {weekdays.map((slot) => (
        <li key={slot.label} className="flex items-center gap-2" data-weekday={slot.weekday}>
          <span className="w-8 font-body text-2xs text-ink-muted">{slot.label}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface-3">
            <span
              className="block h-full rounded-full bg-cyan"
              style={{ width: `${slot.percent ?? 0}%` }}
            />
          </span>
          <span className="w-10 text-right font-numeric text-2xs text-ink-dim">
            {slot.percent === null ? "—" : `${slot.percent}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}
