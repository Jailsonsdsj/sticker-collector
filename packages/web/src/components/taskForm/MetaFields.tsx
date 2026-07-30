import type { Epic, Priority } from "@sticker-collector/shared";
import type { TaskFormAction, TaskFormState } from "../../lib/taskForm";
import { Chip, Field } from "../ui";

const PRIORITIES: { value: Priority; label: string; tone: "low" | "med" | "high" }[] = [
  { value: "low", label: "LOW", tone: "low" },
  { value: "medium", label: "MED", tone: "med" },
  { value: "high", label: "HIGH", tone: "high" },
];

/** Priority and epic — the two labels that group a task rather than schedule it. */
export function MetaFields({
  state,
  dispatch,
  epics,
}: {
  state: TaskFormState;
  dispatch: (action: TaskFormAction) => void;
  epics: Epic[];
}) {
  return (
    <>
      <Field label="Priority">
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <Chip
              key={p.value}
              tone={p.tone}
              shape="rounded"
              font="body"
              fill="tint"
              className="flex-1"
              selected={state.priority === p.value}
              onClick={() => dispatch({ kind: "priority", value: p.value })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Epic">
        <div className="flex flex-wrap gap-2">
          <Chip
            tone="violet"
            font="body"
            size="sm"
            surface="filled"
            selected={state.epicId === null}
            onClick={() => dispatch({ kind: "epic", value: null })}
          >
            None
          </Chip>
          {epics.map((epic) => (
            <Chip
              key={epic.id}
              tone="violet"
              font="body"
              size="sm"
              surface="filled"
              selected={state.epicId === epic.id}
              onClick={() => dispatch({ kind: "epic", value: epic.id })}
            >
              {epic.title}
            </Chip>
          ))}
        </div>
      </Field>
    </>
  );
}
