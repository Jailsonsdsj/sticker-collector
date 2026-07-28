import type { Epic } from "@sticker-collector/shared";
import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import { DeleteEpicDialog } from "../components/DeleteEpicDialog";
import { EpicCard } from "../components/EpicCard";
import { EpicForm } from "../components/EpicForm";
import { AppHeader } from "../components/layout";
import { TaskForm } from "../components/TaskForm";
import { Button, EmptyState, Skeleton } from "../components/ui";
import { ApiError } from "../lib/api";
import { useCreateEpic, useCreateTask, useDeleteEpic, useUpdateEpic } from "../lib/mutations";
import { useEpics, useTasks } from "../lib/queries";

/**
 * Epics — grouping, progress, and the second door into the task form.
 *
 * "The new-task form opened from an epic is the same form used for
 * independently created tasks" (prd/03-epics.md), so this renders `TaskForm`
 * with `defaultEpicId` rather than a variant of it.
 */
export function Epics() {
  const epics = useEpics();
  const tasks = useTasks();

  const createEpic = useCreateEpic();
  const updateEpic = useUpdateEpic();
  const deleteEpic = useDeleteEpic();
  const createTask = useCreateTask();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ epic: Epic | null; nonce: number } | null>(null);
  const [deleting, setDeleting] = useState<Epic | null>(null);
  // The nonce remounts TaskForm, whose state is seeded once on mount — without
  // it, opening from a second epic would keep the first one's answers.
  const [addingTo, setAddingTo] = useState<{ epicId: string; nonce: number } | null>(null);

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
            onClick={() => setEditing({ epic: null, nonce: Date.now() })}
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

      {!epics.isLoading && (epics.data ?? []).length === 0 && (
        <EmptyState
          icon="◆"
          title="No epics yet"
          description="An epic groups related tasks and tracks how much of it is finished."
          action={
            <Button tone="violet" onClick={() => setEditing({ epic: null, nonce: Date.now() })}>
              Create an epic
            </Button>
          }
        />
      )}

      <div className="flex flex-col gap-3">
        {(epics.data ?? []).map((epic) => (
          <EpicCard
            key={epic.id}
            epic={epic}
            tasks={tasksByEpic.get(epic.id) ?? []}
            expanded={expanded === epic.id}
            onToggleExpand={() => setExpanded((id) => (id === epic.id ? null : epic.id))}
            onAddTask={() => setAddingTo({ epicId: epic.id, nonce: Date.now() })}
            onEdit={() => setEditing({ epic, nonce: Date.now() })}
            onDelete={() => setDeleting(epic)}
          />
        ))}
      </div>

      <EpicForm
        key={`epic-${editing?.nonce ?? "closed"}`}
        open={editing !== null}
        epic={editing?.epic ?? null}
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
