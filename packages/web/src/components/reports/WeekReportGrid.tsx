import type { WeekCell, WeekReportRoutine } from "@sticker-collector/shared";
import { WEEKDAYS } from "@sticker-collector/shared";
import { WeekGridShell, WeekRowLabel } from "../weekGrid/WeekGridShell";

/**
 * A week's routines, as the report froze them: read, never ticked.
 *
 * The same shell as the Week tab's grids, so Monday-first is decided in one
 * place — but no checkboxes. This is a record of how the week went; a cell you
 * could tap would suggest it can still change, and it cannot.
 *
 * Four states, each with its own mark as well as its colour — colour alone is
 * not a report:
 *
 *  - **done** ✓ on its own day.
 *  - **late** ↻ ticked on a later day. Counted as work on that later day, and
 *    still a miss on its own.
 *  - **missed** ✕ scheduled and not done before the report was made.
 *  - **off** · not scheduled; not a day it could be missed on.
 */
const LOOK: Record<WeekCell, { mark: string; label: string; background: string }> = {
  done: { mark: "✓", label: "done", background: "var(--color-score-high)" },
  late: { mark: "↻", label: "done late", background: "var(--color-score-mid)" },
  missed: { mark: "✕", label: "missed", background: "var(--color-score-low)" },
  off: { mark: "·", label: "not scheduled", background: "transparent" },
};

export function WeekReportGrid({ routines }: { routines: readonly WeekReportRoutine[] }) {
  if (routines.length === 0) {
    return <p className="font-body text-sm text-ink-dim">No routine was scheduled this week.</p>;
  }

  return (
    <WeekGridShell>
      {routines.map((routine) => (
        <Row key={routine.taskId} routine={routine} />
      ))}
    </WeekGridShell>
  );
}

function Row({ routine }: { routine: WeekReportRoutine }) {
  return (
    <>
      <WeekRowLabel title={routine.title} epicAccent={routine.epicAccent} />
      {routine.cells.map((cell, index) => {
        const look = LOOK[cell];
        const day = WEEKDAYS[index] ?? "";
        return (
          <span
            // The weekday IS the identity of a cell within its row.
            key={day}
            role="img"
            data-cell={cell}
            aria-label={`${routine.title}, ${day}: ${look.label}`}
            title={`${day}: ${look.label}`}
            className="flex aspect-square items-center justify-center rounded-md font-numeric text-sm font-bold text-ink"
            style={{ background: look.background }}
          >
            <span aria-hidden className={cell === "off" ? "text-ink-faint" : undefined}>
              {look.mark}
            </span>
          </span>
        );
      })}
    </>
  );
}

/** The legend, so the four marks never have to be guessed. */
export function WeekReportLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 font-body text-2xs text-ink-muted">
      {(["done", "late", "missed", "off"] as const).map((cell) => (
        <li key={cell} className="flex items-center gap-1">
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-xs font-bold text-ink"
            style={{ background: LOOK[cell].background }}
          >
            {LOOK[cell].mark}
          </span>
          {LOOK[cell].label}
        </li>
      ))}
    </ul>
  );
}
