import type { PerfectDays, StreakReport } from "@sticker-collector/shared";
import { Badge } from "../ui";

export interface StreakListProps {
  streaks: readonly StreakReport[];
  perfect: PerfectDays;
}

/**
 * The headline number on each routine, and the perfect-day run.
 *
 * `longest` sits beside `current` on purpose: a broken streak should leave a
 * record worth rebuilding toward rather than simply resetting to zero
 * (`prd/08-reports.md` §Streaks).
 */
export function StreakList({ streaks, perfect }: StreakListProps) {
  const ranked = [...streaks].sort((a, b) => b.current - a.current || b.longest - a.longest);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl border border-lime bg-panel p-3">
        <div>
          <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">
            Perfect days
          </p>
          <p className="font-numeric text-2xl font-bold text-lime">{perfect.count}</p>
        </div>
        <p className="font-body text-sm text-ink-secondary">
          {perfect.current > 0
            ? `${perfect.current} in a row right now.`
            : "Finish everything scheduled today to start a run."}
        </p>
      </div>

      {ranked.length === 0 ? (
        <p className="font-body text-sm text-ink-dim">
          Routines earn streaks. Add one and it will show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ranked.map((streak) => (
            <li
              key={streak.taskId}
              className="flex items-center gap-3 rounded-xl border border-border bg-panel p-3"
            >
              <span className="min-w-0 flex-1 font-body text-sm font-bold break-words text-ink">
                {streak.title}
              </span>
              <Badge tone={streak.current > 0 ? "lime" : "neutral"} font="numeric" size="sm">
                {streak.current} day{streak.current === 1 ? "" : "s"}
              </Badge>
              <span className="font-numeric text-2xs text-ink-dim">best {streak.longest}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
