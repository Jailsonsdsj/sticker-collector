import type { Task } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { AgendaGrid } from "../components/AgendaGrid";
import { AppHeader } from "../components/layout";
import { TaskForm } from "../components/TaskForm";
import { TaskView } from "../components/TaskView";
import { ErrorState, Skeleton, Tabs } from "../components/ui";
import { WeeklyCompletionGrid } from "../components/WeeklyCompletionGrid";
import { WeeklyGrid } from "../components/WeeklyGrid";
import type { AgendaBlock } from "../lib/agenda";
import { ApiError } from "../lib/api";
import { usePendingCompletions } from "../lib/completionQueue";
import { startedToday } from "../lib/home";
import {
  useCreateTask,
  useDeleteTask,
  useUncompleteOccurrence,
  useUpdateTask,
} from "../lib/mutations";
import { useEpics, useOccurrences, useTasks } from "../lib/queries";
import { appTimeZone, today } from "../lib/timezone";
import { weekDates } from "../lib/week";

/**
 * The week, two ways.
 *
 * **Agenda** is the day laid out by hour: what is at three o'clock, and is it
 * done. **Tick off** is the checkbox week — every routine, including the ones
 * with no times, which the agenda cannot show. **Schedule** is the spec's
 * "routine maintenance", where five taps make a Mon–Fri habit.
 *
 * Three views because one gesture cannot mean three things: tapping a cell
 * cannot both schedule a weekday and tick it off. Tick off stays because the
 * agenda only shows routines that have hours, and every routine created before
 * the agenda has none — removing it would strand them.
 *
 * Agenda is the default: "what am I meant to be doing now" is the question this
 * tab is opened with, day to day, and re-planning is rarer than either ticking
 * or looking. Schedule held the default while it was the only view here, and
 * T-12's five-tap flow is measured from it — that flow is now six taps, one to
 * reach Schedule, which is the cost of the tab it was worth.
 *
 * Ticking here goes through the SAME undo queue as the home screen. If this
 * screen wrote immediately, the identical misclick would be reversible in one
 * place and would silently pay coins in the other.
 *
 * A tap on an agenda block **opens the task** rather than closing it. Tapping
 * to complete made the commonest gesture on the screen the destructive one, and
 * left no way to reach a task's own words, its edit form or its delete from the
 * view where you are actually looking at your day. Tick off is still one tap
 * per day, which is what that tab is for.
 */
const VIEWS = [
  { value: "agenda" as const, label: "Agenda", tone: "lime" as const },
  { value: "complete" as const, label: "Tick off", tone: "cyan" as const },
  { value: "schedule" as const, label: "Schedule", tone: "violet" as const },
];

export function Week() {
  const localToday = today();
  const dates = useMemo(() => weekDates(localToday), [localToday]);
  const [view, setView] = useState<"agenda" | "schedule" | "complete">("agenda");
  // The block that is open, not just its task: a completion is keyed by
  // (task, date), and the agenda is the one screen showing seven of a routine's
  // days at once.
  const [viewing, setViewing] = useState<AgendaBlock | null>(null);
  const [editing, setEditing] = useState<{ task: Task; nonce: number } | null>(null);

  const tasks = useTasks();
  const epics = useEpics();
  const occurrences = useOccurrences(dates[0] as string, dates[6] as string);
  const update = useUpdateTask();
  const uncomplete = useUncompleteOccurrence();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
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
      ) : view === "agenda" ? (
        <>
          <AgendaGrid
            routines={routines}
            accentOf={accentOf}
            occurrences={occurrences.data ?? []}
            dates={dates}
            today={localToday}
            isPending={(block) =>
              queue.isPending({ taskId: block.task.id, scheduledOn: block.date })
            }
            onOpen={setViewing}
          />
          <p className="mt-5 text-center font-body text-sm text-ink-dim">
            Tap a block to open it. Only routines with times appear here.
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

      {viewing && (
        <TaskView
          task={viewing.task}
          epic={
            viewing.task.epicId
              ? ((epics.data ?? []).find((e) => e.id === viewing.task.epicId) ?? null)
              : null
          }
          done={viewing.done || queue.isPending(refOf(viewing))}
          // The block's own date, not today: the agenda shows seven of a
          // routine's days at once, and this is the one that was tapped.
          // Withheld on a day that has not arrived — T-05 refuses it, and
          // W8-05 is where that changes.
          onToggleDone={
            viewing.date > localToday
              ? undefined
              : () => {
                  const ref = refOf(viewing);
                  if (!viewing.done && !queue.isPending(ref)) {
                    queue.complete(ref, {
                      title: viewing.task.title,
                      coins: viewing.task.rewardCoins,
                    });
                  } else if (queue.isPending(ref)) {
                    queue.cancel(ref); // still inside the window: nothing was sent
                  } else {
                    void uncomplete.mutateAsync(ref); // past the window: re-open it
                  }
                  setViewing(null);
                }
          }
          started={startedToday(viewing.task, localToday, appTimeZone())}
          // A routine reaches *In progress* through today's occurrence only, so
          // the offer stands on today's block and nowhere else in the week.
          onToggleStart={
            viewing.date === localToday
              ? () => {
                  update.mutate({
                    id: viewing.task.id,
                    patch: {
                      startedAt: viewing.task.startedAt ? null : new Date().toISOString(),
                    },
                  });
                  setViewing(null);
                }
              : undefined
          }
          onEdit={() => {
            setEditing({ task: viewing.task, nonce: Date.now() });
            setViewing(null);
          }}
          onDelete={() => {
            deleteTask.mutate(viewing.task.id);
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      )}

      <TaskForm
        key={`edit-${editing?.nonce ?? "closed"}`}
        open={editing !== null}
        task={editing?.task ?? null}
        epics={epics.data ?? []}
        routines={tasks.data ?? []}
        // Required by the props, unreachable in edit mode: with a `task` the
        // sheet always sends a diff through `onUpdate`.
        onSubmit={(payload) => createTask.mutateAsync(payload)}
        onUpdate={(patch) =>
          editing ? update.mutateAsync({ id: editing.task.id, patch }) : Promise.resolve()
        }
        onDelete={() => (editing ? deleteTask.mutateAsync(editing.task.id) : Promise.resolve())}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

/** A completion is keyed by (task, date), and the agenda block carries both. */
const refOf = (block: AgendaBlock) => ({ taskId: block.task.id, scheduledOn: block.date });
