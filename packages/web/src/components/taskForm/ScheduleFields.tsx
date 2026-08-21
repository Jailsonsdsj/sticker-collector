import {
  describeConflicts,
  maskHasDay,
  type SlotConflict,
  WEEKDAYS,
  type Weekday,
} from "@sticker-collector/shared";
import type { TaskFormAction, TaskFormState } from "../../lib/taskForm";
import { Chip, Field, Input, Tabs } from "../ui";
import { WEEKDAY_INDICES } from "../weekGrid/WeekGridShell";

// One-off first, and it is also `initialState`'s default — the first tab being
// the selected one is the whole point of the order.
/**
 * The two lists an undated one-off can land in, named as the home screen names
 * them.
 *
 * **General first, and selected**: capture is the common case, and the first
 * tab being the selected one is what makes a two-option switch readable at a
 * glance. Committing a new task to today is the deliberate half.
 */
const SECTIONS = [
  { value: "general" as const, label: "General", tone: "cyan" as const },
  { value: "today" as const, label: "For today", tone: "lime" as const },
];

const TYPES = [
  { value: "oneoff" as const, label: "· One-off", tone: "cyan" as const },
  { value: "routine" as const, label: "↻ Routine", tone: "violet" as const },
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
  typeLocked = false,
  conflicts = [],
}: {
  state: TaskFormState;
  dispatch: (action: TaskFormAction) => void;
  /** True while editing: the choice is fixed at creation and the API refuses it. */
  typeLocked?: boolean;
  /** What the times entered here run into. Blocks the save. */
  conflicts?: SlotConflict[];
}) {
  return (
    <>
      <Field label="Type" hint={typeLocked ? "fixed at creation" : undefined}>
        <Tabs
          items={typeLocked ? TYPES.map((t) => ({ ...t, disabled: true })) : TYPES}
          value={state.type}
          onChange={(value) => dispatch({ kind: "type", value })}
          label="Task type"
        />
      </Field>

      {state.type === "routine" ? (
        <>
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

          <SlotFields state={state} dispatch={dispatch} conflicts={conflicts} />
        </>
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

      {/* Which list this lands in, said as the two lists themselves.
          A checkbox called "Do this today" asked the user to work out where an
          unticked box put the task; the sections are named on the screen it
          came from, so name them here too.

          Offered for an UNDATED one-off only, and that is not a UI preference.
          The API validates a fresh completion against the schedule, and an
          undated one-off is its single exception — anything else put in today's
          list would be a row the server refuses to tick. Giving a date to a
          task takes the choice away with it. */}
      {state.type === "oneoff" && !state.dueDate && (
        <Field label="Section">
          <Tabs
            items={SECTIONS}
            value={state.pinnedToday ? "today" : "general"}
            onChange={(value) => dispatch({ kind: "pinToday", value: value === "today" })}
            tone="lime"
            label="Section"
          />
        </Field>
      )}
    </>
  );
}

/**
 * One start and one end per day the routine runs.
 *
 * Only the checked days get a row: a grid of seven disabled pairs is a wall of
 * fields that says nothing. Checking a day copies the first time already
 * entered, so "same time every day" is one edit rather than seven.
 *
 * **Required for a new routine** — the agenda has nowhere to put a task with no
 * time — but an existing routine may have none, because every routine created
 * before the agenda does. The form asks; it does not retro-fit.
 */
function SlotFields({
  state,
  dispatch,
  conflicts,
}: {
  state: TaskFormState;
  dispatch: (action: TaskFormAction) => void;
  conflicts: SlotConflict[];
}) {
  const days = WEEKDAY_INDICES.filter((index) => maskHasDay(state.weekdays, index));
  if (days.length === 0) return null;

  return (
    <Field label="At" hint="shown on the agenda">
      <div className="flex flex-col gap-2">
        {days.map((index) => {
          const slot = state.slots[index] ?? { start: "", end: "" };
          const clash = conflicts.find((conflict) => conflict.weekday === index);

          return (
            <div key={WEEKDAYS[index]} className="flex items-center gap-2">
              <span className="w-10 shrink-0 font-numeric text-2xs font-bold text-ink-muted">
                {WEEKDAYS[index].toUpperCase()}
              </span>
              <input
                type="time"
                aria-label={`${WEEKDAYS[index]} start`}
                value={slot.start}
                onChange={(event) =>
                  dispatch({
                    kind: "slot",
                    weekday: index,
                    field: "start",
                    value: event.target.value,
                  })
                }
                className="min-w-0 flex-1 rounded-lg border border-surface-4 bg-panel px-2 py-1.5 font-numeric text-md text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              />
              <span aria-hidden className="font-body text-sm text-ink-muted">
                –
              </span>
              <input
                type="time"
                aria-label={`${WEEKDAYS[index]} end`}
                value={slot.end}
                onChange={(event) =>
                  dispatch({
                    kind: "slot",
                    weekday: index,
                    field: "end",
                    value: event.target.value,
                  })
                }
                className="min-w-0 flex-1 rounded-lg border border-surface-4 bg-panel px-2 py-1.5 font-numeric text-md text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              />
              {clash && (
                <span
                  aria-hidden
                  title={`Clashes with ${clash.withTaskTitle}`}
                  className="text-prio-high-fg"
                >
                  ⚠
                </span>
              )}
            </div>
          );
        })}
      </div>

      {conflicts.length > 0 && (
        // A refusal, not a warning, and Save is disabled behind it: the agenda
        // draws two slots in one cell on top of each other, so a saved clash is
        // a task that disappears from the day it was scheduled on. `alert`
        // rather than `status` for the same reason — this one needs answering.
        <p role="alert" className="mt-2 font-body text-sm text-prio-high-fg">
          {describeConflicts(conflicts)}
        </p>
      )}
    </Field>
  );
}
