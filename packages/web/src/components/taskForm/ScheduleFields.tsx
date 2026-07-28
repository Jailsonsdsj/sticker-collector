import { maskHasDay, WEEKDAYS, type Weekday } from "@sticker-collector/shared";
import type { TaskFormAction, TaskFormState } from "../../lib/taskForm";
import { Chip, Field, Input, Tabs } from "../ui";

const TYPES = [
  { value: "routine" as const, label: "↻ Routine", tone: "violet" as const },
  { value: "oneoff" as const, label: "· One-off", tone: "cyan" as const },
];

/**
 * The type switch and whichever schedule it implies.
 *
 * Only one of the two is ever mounted: a routine has no due date and a one-off
 * has no mask, and `createTaskSchema` rejects either combination outright.
 */
export function ScheduleFields({
  state,
  dispatch,
}: {
  state: TaskFormState;
  dispatch: (action: TaskFormAction) => void;
}) {
  return (
    <>
      <Field label="Type">
        <Tabs
          items={TYPES}
          value={state.type}
          onChange={(value) => dispatch({ kind: "type", value })}
          label="Task type"
        />
      </Field>

      {state.type === "routine" ? (
        <Field label="Repeats on">
          <div className="flex gap-2">
            {WEEKDAYS.map((day, index) => (
              <Chip
                key={day}
                tone="violet"
                shape="rounded"
                aria-label={day}
                className="flex-1"
                selected={maskHasDay(state.weekdays, index as Weekday)}
                onClick={() => dispatch({ kind: "weekday", value: index as Weekday })}
              >
                {day.charAt(0)}
              </Chip>
            ))}
          </div>
        </Field>
      ) : (
        <div className="flex gap-3">
          <Input
            id="task-due-date"
            type="date"
            tone="numeric"
            label="Due date"
            hint="optional"
            className="flex-1"
            value={state.dueDate}
            onChange={(e) => dispatch({ kind: "dueDate", value: e.target.value })}
          />
          <Input
            id="task-due-time"
            type="time"
            tone="numeric"
            label="Time"
            value={state.dueTime}
            onChange={(e) => dispatch({ kind: "dueTime", value: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
