import type { Epic, EpicStatus, Task } from "@sticker-collector/shared";
import { todayIn } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { DeleteEpicDialog } from "../components/DeleteEpicDialog";
import { EpicCard } from "../components/EpicCard";
import { EpicForm } from "../components/EpicForm";
import { AppHeader } from "../components/layout";
import { SectionHeading } from "../components/SectionHeading";
import { TaskForm } from "../components/TaskForm";
import { TaskView } from "../components/TaskView";
import { Button, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { ApiError } from "../lib/api";
import { usePendingCompletions } from "../lib/completionQueue";
import {
  useCreateEpic,
  useCreateTask,
  useDeleteEpic,
  useDeleteTask,
  useUpdateEpic,
  useUpdateTask,
} from "../lib/mutations";
import { useEpics, useTasks } from "../lib/queries";
import { useCollapsibleSections } from "../lib/sectionState";
import { today } from "../lib/timezone";

/**
 * Epics — grouping, progress, and the second door into the task form.
 *
 * "The new-task form opened from an epic is the same form used for
 * independently created tasks" (prd/03-epics.md), so this renders `TaskForm`
 * with `defaultEpicId` rather than a variant of it.
 */
/**
 * The three lists, and the order work moves through them.
 *
 * "Achievements" is deliberately last and starts folded: it is a record, not a
 * queue, and an epic finished in March should not push what is running localToday
 * off the first screenful — the same reasoning the home screen folds Missed and
 * the routine backlog.
 */
const SECTIONS = [
  { status: "active" as const, id: "epics-active", title: "Active progress" },
  { status: "next" as const, id: "epics-next", title: "Next steps" },
  { status: "achieved" as const, id: "epics-achieved", title: "Achievements" },
];

export function Epics() {
  const epics = useEpics();
  const tasks = useTasks();

  const createEpic = useCreateEpic();
  const updateEpic = useUpdateEpic();
  const deleteEpic = useDeleteEpic();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const queue = usePendingCompletions();

  // Ticking from here goes through the SAME undo queue as the home screen. A
  // second path that wrote immediately would make the identical action
  // reversible in one place and not the other.
  const localToday = today();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    epic: Epic | null;
    /** Which section the ＋ was tapped in. A new epic lands where it was asked
     *  for, rather than always in Active progress and needing a move. */
    status: EpicStatus;
    nonce: number;
  } | null>(null);
  const [openTask, setOpenTask] = useState<{ task: Task; nonce: number } | null>(null);
  /** Read first, edit second — the same order the Tasks screen uses. */
  const [viewing, setViewing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Epic | null>(null);
  // The nonce remounts TaskForm, whose state is seeded once on mount — without
  // it, opening from a second epic would keep the first one's answers.
  const [addingTo, setAddingTo] = useState<{ epicId: string; nonce: number } | null>(null);

  const folds = useCollapsibleSections();

  /** The three lists, in the order the work moves through them. */
  const byStatus = useMemo(() => {
    const groups: Record<EpicStatus, Epic[]> = { active: [], next: [], achieved: [] };
    for (const epic of epics.data ?? []) groups[epic.status].push(epic);
    return groups;
  }, [epics.data]);

  const tasksByEpic = useMemo(() => {
    const map = new Map<string, typeof tasks.data & object>();
    for (const task of tasks.data ?? []) {
      if (!task.epicId || task.deletedAt) continue;
      const list = map.get(task.epicId);
      if (list) list.push(task);
      else map.set(task.epicId, [task]);
    }
    return map;
  }, [tasks.data]);

  if (epics.error instanceof ApiError && epics.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <AppHeader
        title="Epics"
        trailing={
          <Button
            size="sm"
            tone="violet"
            onClick={() => setEditing({ epic: null, status: "active", nonce: Date.now() })}
          >
            ＋ New
          </Button>
        }
      />

      {epics.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      )}

      {/* Ahead of the empty check: a failed read has no epics either, and the
          empty state invites the user to create one they may already own. */}
      {!epics.isLoading && epics.isError && (
        <ErrorState error={epics.error} onRetry={() => void epics.refetch()} />
      )}

      {!epics.isLoading && !epics.isError && (epics.data ?? []).length === 0 && (
        <EmptyState
          icon="◆"
          title="No epics yet"
          description="An epic groups related tasks and tracks how much of it is finished."
          action={
            <Button
              tone="violet"
              onClick={() => setEditing({ epic: null, status: "active", nonce: Date.now() })}
            >
              Create an epic
            </Button>
          }
        />
      )}

      <div className="flex flex-col gap-6">
        {SECTIONS.map(({ status, title, id }) => (
          <section key={status}>
            <SectionHeading
              tone="epic"
              count={byStatus[status].length}
              open={folds.isOpen(id)}
              onToggle={() => folds.toggle(id)}
              action={
                <button
                  type="button"
                  // Starting a new epic *here* is the point: the section is the
                  // decision, so it should not have to be made twice.
                  aria-label={`New epic in ${title}`}
                  onClick={() => setEditing({ epic: null, status, nonce: Date.now() })}
                  className="cursor-pointer font-body text-xl leading-none text-violet outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                >
                  ＋
                </button>
              }
            >
              {title}
            </SectionHeading>

            {folds.isOpen(id) &&
              (byStatus[status].length === 0 ? (
                <p className="font-body text-sm text-ink-faint">Nothing here yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {byStatus[status].map((epic) => (
                    <EpicCard
                      key={epic.id}
                      epic={epic}
                      tasks={tasksByEpic.get(epic.id) ?? []}
                      expanded={expanded === epic.id}
                      onToggleExpand={() => setExpanded((id) => (id === epic.id ? null : epic.id))}
                      onAddTask={() => setAddingTo({ epicId: epic.id, nonce: Date.now() })}
                      onCompleteTask={(task) =>
                        // An undated one-off closes TODAY — the only date the
                        // API accepts for one.
                        queue.complete(
                          { taskId: task.id, scheduledOn: localToday },
                          { title: task.title, coins: task.rewardCoins },
                        )
                      }
                      onOpenTask={(task) => setViewing(task)}
                      isCompleting={(task) =>
                        queue.isPending({ taskId: task.id, scheduledOn: localToday })
                      }
                      onEdit={() => setEditing({ epic, status: epic.status, nonce: Date.now() })}
                      onDelete={() => setDeleting(epic)}
                    />
                  ))}
                </div>
              ))}
          </section>
        ))}
      </div>

      <EpicForm
        key={`epic-${editing?.nonce ?? "closed"}`}
        open={editing !== null}
        epic={editing?.epic ?? null}
        defaultStatus={editing?.status ?? "active"}
        onClose={() => setEditing(null)}
        onSubmit={(values) =>
          editing?.epic
            ? updateEpic.mutateAsync({ id: editing.epic.id, patch: values })
            : createEpic.mutateAsync(values)
        }
      />

      <TaskForm
        key={`task-${addingTo?.nonce ?? "closed"}`}
        open={addingTo !== null}
        defaultEpicId={addingTo?.epicId ?? null}
        epics={epics.data ?? []}
        onClose={() => setAddingTo(null)}
        onSubmit={(payload) => createTask.mutateAsync(payload)}
      />

      {viewing && (
        <TaskView
          task={viewing}
          epic={epics.data?.find((candidate) => candidate.id === viewing.epicId) ?? null}
          done={
            Boolean(viewing.lastCompletedOn) ||
            queue.isPending({ taskId: viewing.id, scheduledOn: localToday })
          }
          // Only a one-off can be closed from a list with no notion of a day:
          // the API refuses a routine on a date its schedule does not cover.
          onToggleDone={
            viewing.type === "oneoff" && !viewing.lastCompletedOn
              ? () => {
                  queue.complete(
                    { taskId: viewing.id, scheduledOn: localToday },
                    { title: viewing.title, coins: viewing.rewardCoins },
                  );
                  setViewing(null);
                }
              : undefined
          }
          onEdit={() => {
            setOpenTask({ task: viewing, nonce: Date.now() });
            setViewing(null);
          }}
          onDelete={() => {
            void deleteTask.mutateAsync(viewing.id);
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      )}

      <TaskForm
        key={`open-${openTask?.nonce ?? "closed"}`}
        open={openTask !== null}
        task={openTask?.task ?? null}
        // Required by the props, unreachable in edit mode: with a `task` the
        // sheet always sends a diff through `onUpdate`.
        onSubmit={(payload) => createTask.mutateAsync(payload)}
        epics={epics.data ?? []}
        onClose={() => setOpenTask(null)}
        onUpdate={(patch) =>
          openTask ? updateTask.mutateAsync({ id: openTask.task.id, patch }) : Promise.resolve()
        }
        onDelete={() => (openTask ? deleteTask.mutateAsync(openTask.task.id) : Promise.resolve())}
      />

      <DeleteEpicDialog
        epic={deleting}
        pending={deleteEpic.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={(mode) => {
          if (!deleting) return;
          deleteEpic.mutate({ id: deleting.id, mode });
          setDeleting(null);
        }}
      />
    </>
  );
}
