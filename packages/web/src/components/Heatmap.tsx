import type { DayTally, LocalDate } from "@sticker-collector/shared";
import { addDays, WEEKDAYS, weekdayOf } from "@sticker-collector/shared";

export interface HeatmapProps {
  days: readonly DayTally[];
  today: LocalDate;
}

/**
 * A year of days, one cell each, shaded by how much of that day was completed.
 *
 * The most motivating view a habit app owns, and it earns that by making a gap
 * *physically visible* (`prd/08-reports.md` §Consistency). Which is why the
 * bottom of the scale has **two** states rather than one: a day where work was
 * scheduled and missed reads differently from a day with nothing scheduled.
 * Conflating them turns every rest day into a failure and every failure into a
 * rest day, and the gap disappears.
 *
 * Rows are **Monday-first**, matching the mask (bit 0 = Monday) and the weekly
 * grid. A Sunday-first grid puts every cell one row out and looks entirely
 * plausible.
 */
export type HeatLevel = "empty" | "missed" | 1 | 2 | 3 | 4;

export function heatLevel(day: DayTally): HeatLevel {
  if (day.scheduled === 0) return "empty";
  if (day.done === 0) return "missed";

  const share = day.done / day.scheduled;
  if (share >= 1) return 4;
  if (share > 0.66) return 3;
  if (share > 0.33) return 2;
  return 1;
}

const LEVEL_COLOUR: Record<string, string> = {
  empty: "var(--color-heat-empty)",
  missed: "var(--color-heat-missed)",
  "1": "var(--color-heat-1)",
  "2": "var(--color-heat-2)",
  "3": "var(--color-heat-3)",
  "4": "var(--color-heat-4)",
};

export function Heatmap({ days, today }: HeatmapProps) {
  if (days.length === 0) return null;

  // Columns are weeks. The first column is padded so every row is its own
  // weekday all the way across — a partial week at either end must not shift
  // the grid.
  const first = days[0]?.date as LocalDate;
  const lead = weekdayOf(first);
  // Padding cells stand for the days before the window began. Giving them their
  // real dates means every cell has an identity of its own rather than a
  // position, so React never reuses one for a different day.
  const cells: (DayTally | null)[] = [
    ...Array.from({ length: lead }, (_, i) => ({ pad: addDays(first, i - lead) })),
    ...days,
  ].map((cell) => ("pad" in cell ? null : cell)) as (DayTally | null)[];
  const padDates = Array.from({ length: lead }, (_, i) => addDays(first, i - lead));
  const weeks: (DayTally | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) {
    const week = cells.slice(start, start + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <figure aria-label="Completion heatmap" className="flex flex-col gap-2 overflow-x-auto">
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 pr-1">
          {WEEKDAYS.map((label) => (
            <span
              key={label}
              className="h-3 font-body text-3xs leading-3 text-ink-faint"
              aria-hidden="true"
            >
              {label.slice(0, 1)}
            </span>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div
            // Weeks have no id of their own; their position *is* their identity.
            key={`week-${week.find((day) => day)?.date ?? weekIndex}`}
            className="flex flex-col gap-1"
          >
            {week.map((day, rowIndex) => {
              if (!day) {
                const padDate = padDates[rowIndex] ?? `tail-${weekIndex}-${rowIndex}`;
                return <span key={`pad-${padDate}`} className="h-3 w-3" aria-hidden="true" />;
              }

              const level = heatLevel(day);
              return (
                <span
                  key={day.date}
                  // A cell is a small picture of one day. Without a role the
                  // label is not exposed at all — `getByLabelText` would still
                  // find it, which is exactly how that goes unnoticed.
                  role="img"
                  data-date={day.date}
                  data-level={String(level)}
                  data-row={rowIndex}
                  title={labelFor(day)}
                  aria-label={labelFor(day)}
                  className={`h-3 w-3 rounded-xs${day.date === today ? " ring-1 ring-ring-today" : ""}`}
                  style={{ background: LEVEL_COLOUR[String(level)] }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <figcaption className="flex items-center gap-2 font-body text-2xs text-ink-muted">
        <span>Less</span>
        {(["missed", 1, 2, 3, 4] as HeatLevel[]).map((level) => (
          <span
            key={String(level)}
            className="h-3 w-3 rounded-xs"
            style={{ background: LEVEL_COLOUR[String(level)] }}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </figcaption>
    </figure>
  );
}

/** A colour alone is not a report — every cell says what it means. */
function labelFor(day: DayTally): string {
  if (day.scheduled === 0) return `${day.date}: nothing scheduled`;
  return `${day.date}: ${day.done} of ${day.scheduled} completed`;
}
