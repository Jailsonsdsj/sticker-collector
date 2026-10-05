import { addDays, type LocalDate, scoreBand, WEEKDAYS, weekdayOf } from "@sticker-collector/shared";
import type { CSSProperties } from "react";
import { useWeekReport } from "../../lib/queries";
import { Button, Coin, ErrorState, Sheet, Skeleton } from "../ui";
import { WeekReportGrid, WeekReportLegend } from "./WeekReportGrid";

export interface WeekReportSheetProps {
  /** The Monday of the week to show, or null when none is open. */
  weekStart: LocalDate | null;
  /** The week's score as the calendar's R column shows it — the frozen days. */
  score: number | null;
  onClose: () => void;
}

const BAND_COLOUR: Record<string, string> = {
  low: "var(--color-score-low)",
  mid: "var(--color-score-mid)",
  high: "var(--color-score-high)",
};

/** "28 Sep – 4 Oct": the week as a person names it. */
function weekLabel(monday: LocalDate): string {
  const format = (date: LocalDate) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${format(monday)} – ${format(addDays(monday, 6))}`;
}

/**
 * A week's report, opened from its R cell on the calendar.
 *
 * The routines as a grid — done, done late, missed — and below it everything
 * else that got done. Made on Sunday at 22:00 and frozen: what it says now is
 * what it said then, whatever the routines have become since.
 */
export function WeekReportSheet({ weekStart, score, onClose }: WeekReportSheetProps) {
  const report = useWeekReport(weekStart);

  // Nothing mounted when nothing is open: a closed `<dialog>` keeps its DOM,
  // and a stale week's grid would be the one in it.
  if (weekStart === null) return null;

  const routines = report.data?.routines ?? [];
  const runs = routines.flatMap((routine) => routine.cells).filter((cell) => cell !== "off");
  const onTime = runs.filter((cell) => cell === "done").length;

  return (
    <Sheet
      open
      onClose={onClose}
      title={weekLabel(weekStart)}
      leading={
        <Button variant="ghost" tone="neutral" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {report.isLoading ? (
        <Skeleton variant="block" />
      ) : report.isError || !report.data ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            {score !== null && (
              <span
                role="img"
                aria-label={`Week score ${score} out of 100`}
                className="flex size-14 items-center justify-center rounded-xl font-numeric text-2xl font-bold text-ink"
                style={{ background: BAND_COLOUR[scoreBand(score)] }}
              >
                {score}
              </span>
            )}
            <p className="font-body text-sm text-ink-secondary">
              <span className="font-numeric font-bold text-ink">
                {onTime}/{runs.length}
              </span>{" "}
              routine runs done on their day.
            </p>
          </div>

          <section aria-label="Routines" className="flex flex-col gap-3">
            <WeekReportGrid routines={routines} />
            {routines.length > 0 && <WeekReportLegend />}
          </section>

          <section aria-label="Also done this week" className="flex flex-col gap-2">
            <h3 className="font-numeric text-2xs tracking-kicker text-ink-muted uppercase">
              Also done this week
            </h3>
            {report.data.others.length === 0 ? (
              <p className="font-body text-sm text-ink-dim">Nothing else this week.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {report.data.others.map((item) => (
                  <li
                    key={`${item.taskId}-${item.doneOn}`}
                    className="flex items-center gap-2 rounded-lg border-l-[3px] bg-surface-1 px-3 py-2 [border-left-color:var(--ui-epic)]"
                    style={
                      {
                        "--ui-epic": `var(--color-${item.epicAccent ?? "epic-none"})`,
                      } as CSSProperties
                    }
                  >
                    <span className="w-8 shrink-0 font-numeric text-2xs font-bold text-ink-muted uppercase">
                      {WEEKDAYS[weekdayOf(item.doneOn)]}
                    </span>
                    <span className="min-w-0 flex-1 font-body text-sm text-ink break-words">
                      {item.title}
                    </span>
                    <span className="flex items-center gap-1 font-numeric text-sm font-bold text-coin">
                      <Coin size="xs" />+{item.coins}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
