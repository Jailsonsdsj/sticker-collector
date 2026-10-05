import type { Task } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { AgendaGrid } from "../components/AgendaGrid";
import { AppHeader } from "../components/layout";
import { TaskForm } from "../components/TaskForm";
import { TaskView } from "../components/TaskView";
import { ErrorState, Skeleton } from "../components/ui";
import type { AgendaBlock } from "../lib/agenda";
import { ApiError } from "../lib/api";
import { usePendingCompletions } from "../lib/completionQueue";
import { startedToday } from "../lib/home";
import {
  useCreateTask,
  useDeleteTask,
  useToggleSubtask,
  useUncompleteOccurrence,
  useUpdateTask,
} from "../lib/mutations";
import { useEpics, useOccurrences, useTasks } from "../lib/queries";
import { appTimeZone, today } from "../lib/timezone";
import { weekDates } from "../lib/week";

/**
 * The week, as an agenda: each day laid out by hour — what is at three
 * o'clock, and is it done.
 *
 * It used to be one of three views, beside a checkbox week (*Tick off*) and a
 * weekday editor (*Schedule*). Neither was being used, so the agenda is the
 * screen now. A routine's weekdays are set in its own form, and a run is ticked
 * from the task list or from the block's own sheet here.
 *
 * Ticking goes through the SAME undo queue as the home screen. If this screen
 * wrote immediately, the identical misclick would be reversible in one place
 * and would silently pay coins in the other.
 *
 * A tap on a block **opens the task** rather than closing it. Tapping to
 * complete made the commonest gesture on the screen the destructive one, and
 * left no way to reach a task's own words, its edit form or its delete from the
 * view where you are actually looking at your day.
 */
export function Week() {
  const localToday = today();
  const toggleSubtask = useToggleSubtask();

  const dates = useMemo(() => weekDates(localToday), [localToday]);
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

  /**
   * The open sheet's task, as the cache has it now.
   *
   * `viewing` holds the block as it was when it was tapped, so a step ticked
   * inside the sheet never reached it: the request went, the cache updated, and
   * the checklist sat at 0/2 until the sheet was closed and reopened.
   */
  const liveTask = viewing
    ? (tasks.data?.find((row) => row.id === viewing.task.id) ?? viewing.task)
    : null;

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
      ) : tasks.isError ? (
        // The grid renders from `tasks.data ?? []`, so a failed read would
        // otherwise draw a plausible, empty week — a routine schedule that
        // looks wiped rather than unavailable.
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : (
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
      )}

      {viewing && (
        <TaskView
          // The LIVE row, not the snapshot the block was opened with. `viewing`
          // is React state, so nothing that changes afterwards reaches it — a
          // ticked step updated the cache and the sheet sat unmoved, which is
          // the same defect the tasks tab had and the same fix.
          task={liveTask ?? viewing.task}
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
          // The block's own date, so a routine's checklist shows the run that
          // was tapped rather than today's — and ticks are stamped with it.
          // Tuesday's run is closed against Tuesday's steps, so a missed
          // Tuesday has to be tickable for Tuesday or its Done can never
          // unlock. Offered wherever Done is: not on a day still to come.
          today={viewing.date}
          onToggleSubtask={
            viewing.date > localToday
              ? undefined
              : (subtaskId, done) =>
                  toggleSubtask.mutate({
                    taskId: viewing.task.id,
                    subtaskId,
                    done,
                    on: viewing.date,
                  })
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
