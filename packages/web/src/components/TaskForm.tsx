import type { CreateTaskInput, Epic } from "@sticker-collector/shared";
import { useReducer, useState } from "react";
import { initialState, reduce, toPayload, validate } from "../lib/taskForm";
import { EffortFields } from "./taskForm/EffortFields";
import { MetaFields } from "./taskForm/MetaFields";
import { ScheduleFields } from "./taskForm/ScheduleFields";
import { Button, Input, Sheet, Textarea } from "./ui";

/**
 * The one task form. The same sheet opens from the main button and from inside
 * an epic (prd/03-epics.md) — the only difference is that the second arrives
 * with its epic already chosen.
 *
 * All the rules live in `lib/taskForm.ts`; this is the wiring.
 */
export interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTaskInput) => Promise<unknown>;
  epics?: Epic[];
  /** Set when opened from an epic — the one thing that is not blank. */
  defaultEpicId?: string | null;
}

export function TaskForm({ open, onClose, onSubmit, epics = [], defaultEpicId }: TaskFormProps) {
  const [state, dispatch] = useReducer(reduce, { epicId: defaultEpicId }, initialState);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const problem = validate(state);

  async function save() {
    const payload = toPayload(state);
    if (!payload || saving) return;
    setSaving(true);
    setFailed(null);
    try {
      await onSubmit(payload);
      onClose();
    } catch {
      // Stay open: everything typed is still here, and closing would lose it.
      setFailed("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New task"
      leading={
        <Button variant="ghost" tone="neutral" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
      trailing={
        <Button tone="lime" size="sm" disabled={problem !== null || saving} onClick={save}>
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

      <ScheduleFields state={state} dispatch={dispatch} />
      <EffortFields state={state} dispatch={dispatch} />
      <MetaFields state={state} dispatch={dispatch} epics={epics} />

      {(problem || failed) && (
        <p role="alert" className="font-body text-sm text-prio-high-fg">
          {failed ?? problem}
        </p>
      )}
    </Sheet>
  );
}
