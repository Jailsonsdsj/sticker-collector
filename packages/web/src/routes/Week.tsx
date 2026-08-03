import type { Task } from "@sticker-collector/shared";
import { todayIn } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { AppHeader } from "../components/layout";
import { ErrorState, Skeleton, Tabs } from "../components/ui";
import { WeeklyCompletionGrid } from "../components/WeeklyCompletionGrid";
import { WeeklyGrid } from "../components/WeeklyGrid";
import { ApiError } from "../lib/api";
import { usePendingCompletions } from "../lib/completionQueue";
import { useUncompleteOccurrence, useUpdateTask } from "../lib/mutations";
import { useEpics, useOccurrences, useTasks } from "../lib/queries";
import { today } from "../lib/timezone";
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
// Complete first, and selected by default: ticking a day is what you come back
// to daily, where re-planning a routine is occasional. T-12's five-tap flow is
// now five taps plus one to reach Schedule — a deliberate trade, and the reason
// the order changed too.
const VIEWS = [
  { value: "complete" as const, label: "Complete", tone: "lime" as const },
  { value: "schedule" as const, label: "Schedule", tone: "violet" as const },
];

export function Week() {
  const localToday = today();
  const dates = useMemo(() => weekDates(localToday), [localToday]);
  const [view, setView] = useState<"schedule" | "complete">("complete");

  const tasks = useTasks();
  const epics = useEpics();
  const occurrences = useOccurrences(dates[0] as string, dates[6] as string);
  const update = useUpdateTask();
  const uncomplete = useUncompleteOccurrence();
  const queue = usePendingCompletions();

  // A row wears its epic's colour, the same accent the home screen uses, so an
  // epic reads as one colour wherever its tasks appear.
  const accentById = useMemo(
    () => new Map((epics.data ?? []).map((epic) => [epic.id, epic.accent])),
    [epics.data],
  );
  const accentOf = (task: Task) => (task.epicId ? (accentById.get(task.epicId) ?? null) : null);

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
      ) : tasks.isError ? (
        // The grid renders from `tasks.data ?? []`, so a failed read would
        // otherwise draw a plausible, empty week — a routine schedule that
        // looks wiped rather than unavailable.
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : view === "schedule" ? (
        <>
          <WeeklyGrid
            routines={routines}
            accentOf={accentOf}
            today={localToday}
            onChangeMask={(id, weekdays) => update.mutate({ id, patch: { weekdays } })}
          />
          <p className="mt-5 text-center font-body text-sm text-ink-dim">
            Tap a cell to add or remove that weekday. A routine always keeps at least one day.
          </p>
        </>
      ) : (
        <WeeklyCompletionGrid
          routines={routines}
          accentOf={accentOf}
          occurrences={occurrences.data ?? []}
          dates={dates}
          today={localToday}
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
