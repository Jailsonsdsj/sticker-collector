import { todayIn } from "@sticker-collector/shared";
import { useMemo } from "react";
import { Navigate } from "react-router";
import { AppHeader } from "../components/layout";
import { Skeleton } from "../components/ui";
import { WeeklyGrid } from "../components/WeeklyGrid";
import { ApiError } from "../lib/api";
import { useUpdateTask } from "../lib/mutations";
import { useTasks } from "../lib/queries";

/**
 * The weekly grid — routine maintenance without a form (prd/02-tasks.md).
 *
 * Only routines appear: a one-off has no weekly schedule to edit. Toggling a
 * cell patches the task's weekday mask optimistically, so five taps make a
 * Mon–Fri habit and each one lands immediately.
 */
export function Week() {
  const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const tasks = useTasks();
  const update = useUpdateTask();

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

      {tasks.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      ) : (
        <WeeklyGrid
          routines={routines}
          today={today}
          onChangeMask={(id, weekdays) => update.mutate({ id, patch: { weekdays } })}
        />
      )}

      <p className="mt-5 text-center font-body text-sm text-ink-dim">
        Tap a cell to add or remove that weekday. A routine always keeps at least one day.
      </p>
    </>
  );
}
