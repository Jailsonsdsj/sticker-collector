import type { CreateTaskInput, Epic, Task, UpdateTask } from "@sticker-collector/shared";
import { describeConflicts, findSlotConflicts } from "@sticker-collector/shared";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
import { SubtaskFields } from "./taskForm/SubtaskFields";
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
   * Optional, but every caller should pass it: without the list the form
   * cannot refuse a clash and the Worker's 409 becomes the first the user hears
   * of it, after the save.
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
  const titleRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * What the times entered here run into.
   *
   * Recomputed as they are typed — a refusal that arrives on submit is a
   * refusal of a decision already made. Editing a routine never reports it
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

  // Blocking, not advisory: the agenda draws two slots in one cell on top of
  // each other, so saving a clash hides one of the two tasks. The Worker
  // refuses it too — this is the copy of the rule that can explain itself
  // before the request is sent.
  //
  // The message itself belongs to `ScheduleFields`, beside the times that
  // caused it. Repeating it in the footer would put the same sentence on screen
  // twice; all this needs from it is whether to hold the button.
  const clash = describeConflicts(conflicts) !== null;
  const problem = validate(state);

  const patch = task ? toPatch(state, task) : null;
  // Editing with nothing changed is not an error, but there is nothing to send.
  const nothingToSave = clash || (task ? patch === null : problem !== null);

  /**
   * A new task opens with the cursor already in the title.
   *
   * There is exactly one thing to do on a blank form, and making the user tap
   * the field to start doing it is a tap the form could have taken itself. On
   * a phone it also brings the keyboard up with the sheet, so the first thing
   * that happens is typing.
   *
   * **Only when it is blank.** On an edit the title is already written, and
   * dropping a cursor into it puts a full field one keystroke from being
   * replaced — the opposite of helpful on a screen someone opened to change
   * the priority.
   *
   * Imperative rather than `autoFocus`: two forms are mounted at once
   * (TD-44), and the attribute fires on mount for both regardless of which
   * one is showing. This runs when a sheet *opens*, which only one ever does.
   *
   * Synchronously, and deliberately not on a later frame. `Sheet` calls
   * `showModal()` — which moves focus itself — from its own effect, and a
   * child's effects run before its parent's, so by here it has already
   * happened. A deferred focus would land some milliseconds after the sheet is
   * usable and take the cursor out of whichever field the user had reached
   * first, which is worse than not focusing at all.
   */
  useEffect(() => {
    if (!open || task) return;
    titleRef.current?.focus();
  }, [open, task]);

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
        ref={titleRef}
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
        // Says what the field accepts, because markdown you do not know is
        // there is markdown you never use. No literal "url" in it — the field
        // below is the URL field, and a hint is part of a field's accessible
        // name, so the word would make "the URL field" ambiguous to anything
        // querying by label, screen readers included.
        hint="markdown — **bold**, *italic*, - lists, [text](link)"
        // Six rows, three times the primitive's default two. A task's
        // description is where the *how* goes — steps, links, the thing you
        // will have forgotten by the time you come back to it — and two rows
        // made a paragraph feel like the wrong place to put it. The sheet
        // scrolls, so the extra height costs nothing above it.
        rows={6}
        // The one field in the app that earns a drag handle. Everywhere else a
        // textarea holds a caption and the design keeps it fixed, which is
        // right; this one holds however much the task needs, and six rows is a
        // starting guess rather than a limit.
        resizable
        placeholder="Notes, context, links…"
        value={state.description}
        onChange={(e) => dispatch({ kind: "description", value: e.target.value })}
      />
      {/* Directly under the description, which is where the request put it —
          and where it belongs: the notes say what this is, the steps say what
          doing it consists of. */}
      <SubtaskFields state={state} dispatch={dispatch} />

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
