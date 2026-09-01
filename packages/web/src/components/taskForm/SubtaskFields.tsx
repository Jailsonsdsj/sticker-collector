import { MAX_SUBTASKS } from "@sticker-collector/shared";
import type { TaskFormAction, TaskFormState } from "../../lib/taskForm";
import { Button, Field, Input } from "../ui";

export interface SubtaskFieldsProps {
  state: TaskFormState;
  dispatch: (action: TaskFormAction) => void;
}

/**
 * The steps, under the description.
 *
 * **One row per step, and a row is only ever added by asking.** A list that
 * grows a blank row as you type the last one is a list you cannot finish: there
 * is always one more empty box, and Save sits under it looking unreachable. The
 * button is the whole of the interaction.
 *
 * Blank rows are kept in the form's state rather than dropped as they empty —
 * clearing a field would otherwise delete the field you were clearing — and
 * trimmed away at the payload (`cleanSubtasks`).
 */
export function SubtaskFields({ state, dispatch }: SubtaskFieldsProps) {
  const full = state.subtasks.length >= MAX_SUBTASKS;

  return (
    <Field label="Steps" hint="optional — ticked off inside the task">
      <div className="flex flex-col gap-2">
        {state.subtasks.map((title, index) => (
          <div
            // The index IS the identity here: a step has no id until it is
            // saved, and two rows may legitimately hold the same text while
            // being typed.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            className="flex items-center gap-2"
          >
            <Input
              aria-label={`Step ${index + 1}`}
              placeholder="What has to happen?"
              className="flex-1"
              value={title}
              onChange={(event) => dispatch({ kind: "subtask", index, value: event.target.value })}
            />
            <Button
              variant="ghost"
              tone="magenta"
              size="sm"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => dispatch({ kind: "removeSubtask", index })}
            >
              ✕
            </Button>
          </div>
        ))}

        {/* Absent at the ceiling rather than disabled: a control that can never
            do anything is noise on the screen it sits on. */}
        {!full && (
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            onClick={() => dispatch({ kind: "addSubtask" })}
          >
            {state.subtasks.length === 0 ? "Add a step" : "Add another"}
          </Button>
        )}
      </div>
    </Field>
  );
}
