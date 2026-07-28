import { todayIn } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { AppHeader } from "../components/layout";
import { Skeleton, Tabs } from "../components/ui";
import { WeeklyCompletionGrid } from "../components/WeeklyCompletionGrid";
import { WeeklyGrid } from "../components/WeeklyGrid";
import { ApiError } from "../lib/api";
import { usePendingCompletions } from "../lib/completionQueue";
import { useUncompleteOccurrence, useUpdateTask } from "../lib/mutations";
import { useOccurrences, useTasks } from "../lib/queries";
import { weekDates } from "../lib/week";

/**
 * The week, two ways.
 *
 * **Schedule** is the spec's "routine maintenance" — five taps make a Mon–Fri
 * habit. **Complete** is the design bundle's version, where a cell ticks that
 * day. They are separate views because one gesture cannot mean both.
 *
 * Schedule is the default so the five-tap flow stays five taps. Day to day you
 * would tick far more often than you re-plan, so that default may be worth
 * revisiting — but it is the one T-12 is measured against.
 *
 * Ticking here goes through the SAME undo queue as the home screen. If this
 * screen wrote immediately, the identical misclick would be reversible in one
 * place and would silently pay coins in the other.
 */
const VIEWS = [
  { value: "schedule" as const, label: "Schedule", tone: "violet" as const },
  { value: "complete" as const, label: "Complete", tone: "lime" as const },
];

export function Week() {
  const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const dates = useMemo(() => weekDates(today), [today]);
  const [view, setView] = useState<"schedule" | "complete">("schedule");

  const tasks = useTasks();
  const occurrences = useOccurrences(dates[0] as string, dates[6] as string);
  const update = useUpdateTask();
  const uncomplete = useUncompleteOccurrence();
  const queue = usePendingCompletions();

  const routines = useMemo(
    () => (tasks.data ?? []).filter((task) => task.type === "routine" && !task.deletedAt),
    [tasks.data],
  );

  if (tasks.error instanceof ApiError && tasks.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <AppHeader title="This week" />

      <Tabs items={VIEWS} value={view} onChange={setView} label="Week view" className="mb-5" />

      {tasks.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      ) : view === "schedule" ? (
        <>
          <WeeklyGrid
            routines={routines}
            today={today}
            onChangeMask={(id, weekdays) => update.mutate({ id, patch: { weekdays } })}
          />
          <p className="mt-5 text-center font-body text-sm text-ink-dim">
            Tap a cell to add or remove that weekday. A routine always keeps at least one day.
          </p>
        </>
      ) : (
        <WeeklyCompletionGrid
          routines={routines}
          occurrences={occurrences.data ?? []}
          dates={dates}
          today={today}
          isPending={(taskId, scheduledOn) => queue.isPending({ taskId, scheduledOn })}
          onToggle={(taskId, scheduledOn, next) => {
            const task = routines.find((t) => t.id === taskId);
            const ref = { taskId, scheduledOn };
            if (next) {
              queue.complete(ref, { title: task?.title ?? "", coins: task?.rewardCoins ?? 0 });
            } else if (queue.isPending(ref)) {
              queue.cancel(ref); // still inside the window: nothing was ever sent
            } else {
              void uncomplete.mutateAsync(ref); // past the window: re-open it
            }
          }}
        />
      )}
    </>
  );
}
