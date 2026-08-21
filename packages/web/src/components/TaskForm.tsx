import type { CreateTaskInput, Epic, Task, UpdateTask } from "@sticker-collector/shared";
import { findSlotConflicts } from "@sticker-collector/shared";
import { useMemo, useReducer, useState } from "react";
import {
  initialState,
  reduce,
  stateFromTask,
  toPatch,
  toPayload,
  toSlots,
  validate,
} from "../lib/taskForm";
import { DeleteTaskAction } from "./taskForm/DeleteTaskAction";
import { EffortFields } from "./taskForm/EffortFields";
import { MetaFields } from "./taskForm/MetaFields";
import { ScheduleFields } from "./taskForm/ScheduleFields";
import { Button, Input, Sheet, Textarea } from "./ui";

/**
 * The one task form. The same sheet creates, and — given a `task` — edits.
 *
 * Editing differs in two ways that are not cosmetic. The type switch is locked,
 * because the choice is fixed at creation and the API rejects a change. And the
 * save sends a **diff**: `updateTaskSchema` is strict, so a full payload would
 * be refused for carrying `type` at all.
 *
 * All the rules live in `lib/taskForm.ts`; this is the wiring.
 */
export interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTaskInput) => Promise<unknown>;
  /** Present to edit rather than create. */
  task?: Task | null;
  onUpdate?: (patch: UpdateTask) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  epics?: Epic[];
  /**
   * Every other routine's times, so a clash can be pointed out while it is
   * being made rather than discovered on the agenda.
   *
   * Optional: a caller with no list simply gets no warning, which is what the
   * epic screen does.
   */
  routines?: Task[];
  /** Set when opened from an epic — the one thing that is not blank. */
  defaultEpicId?: string | null;
}

export function TaskForm({
  open,
  onClose,
  onSubmit,
  task,
  onUpdate,
  onDelete,
  epics = [],
  routines = [],
  defaultEpicId,
}: TaskFormProps) {
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    task ? stateFromTask(task) : initialState({ epicId: defaultEpicId }),
  );
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const problem = validate(state);

  /**
   * What the times entered here run into.
   *
   * Recomputed as they are typed — a warning that arrives on submit is a
   * warning about a decision already made. Editing a routine never reports it
   * against itself.
   */
  const conflicts = useMemo(
    () =>
      findSlotConflicts(
        toSlots(state) ?? [],
        routines.filter((candidate) => candidate.type === "routine"),
        task?.id,
      ),
    [state, routines, task?.id],
  );
  const patch = task ? toPatch(state, task) : null;
  // Editing with nothing changed is not an error, but there is nothing to send.
  const nothingToSave = task ? patch === null : problem !== null;

  async function save() {
    if (saving || nothingToSave) return;
    setSaving(true);
    setFailed(null);
    try {
      if (task && patch) await onUpdate?.(patch);
      else {
        const payload = toPayload(state);
        if (!payload) return;
        await onSubmit(payload);
      }
      onClose();
    } catch {
      // Stay open: everything typed is still here, and closing would lose it.
      setFailed("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await onDelete?.();
      onClose();
    } catch {
      setFailed("Could not delete. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={task ? "Edit task" : "New task"}
      leading={
        <Button variant="ghost" tone="neutral" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
      trailing={
        <Button tone="lime" size="sm" disabled={nothingToSave || saving} onClick={save}>
          Save
        </Button>
      }
    >
      <Input
        id="task-title"
        label="Title"
        required
        placeholder="What needs doing?"
        value={state.title}
        onChange={(e) => dispatch({ kind: "title", value: e.target.value })}
      />
      <Textarea
        id="task-description"
        label="Description"
        // Six rows, three times the primitive's default two. A task's
        // description is where the *how* goes — steps, links, the thing you
        // will have forgotten by the time you come back to it — and two rows
        // made a paragraph feel like the wrong place to put it. The sheet
        // scrolls, so the extra height costs nothing above it.
        rows={6}
        placeholder="Notes, context, links…"
        value={state.description}
        onChange={(e) => dispatch({ kind: "description", value: e.target.value })}
      />
      <Input
        id="task-url"
        tone="url"
        label="URL"
        placeholder="https://"
        value={state.url}
        onChange={(e) => dispatch({ kind: "url", value: e.target.value })}
      />

      <ScheduleFields
        state={state}
        dispatch={dispatch}
        typeLocked={Boolean(task)}
        conflicts={conflicts}
      />
      <EffortFields state={state} dispatch={dispatch} />
      <MetaFields state={state} dispatch={dispatch} epics={epics} />

      {(problem || failed) && (
        <p role="alert" className="font-body text-sm text-prio-high-fg">
          {failed ?? problem}
        </p>
      )}

      {task && onDelete && <DeleteTaskAction disabled={saving} onDelete={remove} />}
    </Sheet>
  );
}
