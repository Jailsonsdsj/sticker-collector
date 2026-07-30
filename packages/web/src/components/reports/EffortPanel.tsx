import type { EffortBucket, Epic, EpicEffort } from "@sticker-collector/shared";
import { coinsToHours } from "@sticker-collector/shared";

export interface EffortPanelProps {
  weeks: readonly EffortBucket[];
  epics: readonly EpicEffort[];
  /** For resolving names — the aggregate only knows ids. */
  epicsById: ReadonlyMap<string, Epic>;
}

/**
 * Minutes invested, and where they went.
 *
 * Minutes and coins earned are the **same axis** — a coin is a minute — so this
 * is not an economic view: it says how much work happened, not how it was spent
 * (`prd/08-reports.md` §Effort).
 */
export function EffortPanel({ weeks, epics, epicsById }: EffortPanelProps) {
  // The last twelve weeks: a year of bars on a phone is unreadable.
  const recent = weeks.slice(-12);
  const peak = Math.max(1, ...recent.map((week) => Math.abs(week.minutes)));
  const total = weeks.reduce((sum, week) => sum + week.minutes, 0);
  const { hours, minutes } = coinsToHours(total);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">
          Invested this year
        </p>
        <p className="font-numeric text-2xl font-bold text-coin">
          {hours} h {minutes} m
        </p>
        <p className="font-body text-2xs text-ink-dim">
          {total.toLocaleString()} minutes — the same number as coins earned
        </p>
      </div>

      <div>
        <p className="mb-2 font-body text-2xs tracking-kicker text-ink-muted uppercase">
          Last 12 weeks
        </p>
        <ul className="flex h-24 items-end gap-1" aria-label="Minutes per week">
          {recent.map((week) => (
            <li
              key={week.key}
              data-week={week.key}
              title={`Week of ${week.key}: ${week.minutes} minutes`}
              className="flex-1 rounded-t-sm bg-coin"
              style={{ height: `${Math.max(2, (Math.abs(week.minutes) / peak) * 100)}%` }}
            />
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 font-body text-2xs tracking-kicker text-ink-muted uppercase">
          Where the time went
        </p>
        {epics.length === 0 ? (
          <p className="font-body text-sm text-ink-dim">No completed work yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {epics.map((epic) => (
              <li key={epic.epicId ?? "unassigned"} className="flex items-center gap-2">
                <span className="flex-1 truncate font-body text-sm text-ink">
                  {/* Unassigned work is named, never dropped — the API keeps it
                      visible for the same reason. */}
                  {epic.epicId ? (epicsById.get(epic.epicId)?.title ?? "Unknown") : "No epic"}
                </span>
                <span className="font-numeric text-sm text-ink-dim">{epic.minutes} m</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
