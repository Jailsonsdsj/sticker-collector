import {
  type CreateTaskInput,
  maskToggleDay,
  type Priority,
  type TaskType,
  WEEKDAYS_MASK_NONE,
  type Weekday,
} from "@sticker-collector/shared";

/**
 * The task form's state, as a reducer.
 *
 * The interesting parts of this form are not the fields — they are the
 * relationships between them, and every one of them is invisible in a
 * screenshot:
 *
 *  - reward follows effort until the user overrides it, then stops forever;
 *  - a routine must not carry a due date and a one-off must not carry a mask;
 *    `createTaskSchema` is strict and returns 400 for either;
 *  - the weekday mask is bit 0 = Monday, and an off-by-one moves a routine to
 *    the wrong day while looking perfectly correct on screen.
 *
 * Keeping it here rather than in the component means all of that is testable
 * without rendering anything.
 */

/** Numeric fields are strings so the input can be empty mid-typing. */
export interface TaskFormState {
  title: string;
  description: string;
  url: string;
  type: TaskType;
  weekdays: number;
  dueDate: string;
  dueTime: string;
  effortMinutes: string;
  rewardCoins: string;
  /** Set the moment the user edits reward; from then on it stops tracking effort. */
  rewardLocked: boolean;
  priority: Priority;
  epicId: string | null;
}

export type TaskFormAction =
  | { kind: "title" | "description" | "url"; value: string }
  | { kind: "type"; value: TaskType }
  | { kind: "weekday"; value: Weekday }
  | { kind: "dueDate" | "dueTime"; value: string }
  | { kind: "effort"; value: string }
  | { kind: "reward"; value: string }
  | { kind: "priority"; value: Priority }
  | { kind: "epic"; value: string | null };

export const EFFORT_PRESETS = [15, 30, 60, 90] as const;

/**
 * A blank form, except for an epic when the form was opened from one.
 *
 * That single difference is the whole of the done-when: from an epic the label
 * arrives filled in; from the main button nothing is.
 */
export function initialState(options: { epicId?: string | null } = {}): TaskFormState {
  return {
    title: "",
    description: "",
    url: "",
    type: "routine",
    weekdays: WEEKDAYS_MASK_NONE,
    dueDate: "",
    dueTime: "",
    effortMinutes: "",
    rewardCoins: "",
    rewardLocked: false,
    priority: "medium",
    epicId: options.epicId ?? null,
  };
}

export function reduce(state: TaskFormState, action: TaskFormAction): TaskFormState {
  switch (action.kind) {
    case "title":
    case "description":
    case "url":
      return { ...state, [action.kind]: action.value };

    case "type":
      // Discard the other type's scheduling outright. Leaving it around would
      // send a routine with a due date the moment someone switched back.
      return action.value === "routine"
        ? { ...state, type: "routine", dueDate: "", dueTime: "" }
        : { ...state, type: "oneoff", weekdays: WEEKDAYS_MASK_NONE };

    case "weekday":
      return { ...state, weekdays: maskToggleDay(state.weekdays, action.value) };

    case "dueDate":
    case "dueTime":
      return { ...state, [action.kind]: action.value };

    case "effort":
      // One minute of effort is one coin, until the user says otherwise.
      return {
        ...state,
        effortMinutes: action.value,
        rewardCoins: state.rewardLocked ? state.rewardCoins : action.value,
      };

    case "reward":
      return { ...state, rewardCoins: action.value, rewardLocked: true };

    case "priority":
      return { ...state, priority: action.value };

    case "epic":
      return { ...state, epicId: action.value };
  }
}

const positiveInt = (raw: string): number | null => {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isInteger(n) && n > 0 ? n : null;
};

/** Whether the form can be submitted, and why not when it cannot. */
export function validate(state: TaskFormState): string | null {
  if (!state.title.trim()) return "A title is required.";
  if (positiveInt(state.effortMinutes) === null) return "Effort must be a whole number of minutes.";
  if (state.type === "routine" && state.weekdays === WEEKDAYS_MASK_NONE) {
    return "Pick at least one weekday.";
  }
  if (state.rewardLocked) {
    const reward = Number(state.rewardCoins);
    if (!Number.isInteger(reward) || reward < 0) return "Reward must be a whole number of coins.";
  }
  return null;
}

/**
 * Combines the local date and time the user picked into a UTC instant.
 *
 * A date with no time means midnight, local. Parsing without a `Z` is what
 * makes the browser apply the user's own offset — the same offset the API
 * resolves the day back through.
 */
export function toDueAt(dueDate: string, dueTime: string): string | null {
  if (!dueDate) return null;
  const at = new Date(`${dueDate}T${dueTime || "00:00"}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The create payload, shaped for whichever type this is. Null when invalid. */
export function toPayload(state: TaskFormState): CreateTaskInput | null {
  if (validate(state) !== null) return null;

  const effortMinutes = positiveInt(state.effortMinutes);
  if (effortMinutes === null) return null;

  const common = {
    title: state.title.trim(),
    description: state.description.trim() || null,
    url: state.url.trim() || null,
    epicId: state.epicId,
    effortMinutes,
    // Omitted rather than mirrored when untouched, so the schema's own
    // "reward defaults to effort" rule is the single source of that behaviour.
    rewardCoins: state.rewardLocked ? Number(state.rewardCoins) : undefined,
    priority: state.priority,
  };

  return state.type === "routine"
    ? { ...common, type: "routine", weekdays: state.weekdays }
    : { ...common, type: "oneoff", dueAt: toDueAt(state.dueDate, state.dueTime) };
}

/** What the reward field's hint should say — the design's `rewardHint`. */
export const rewardHint = (state: TaskFormState) =>
  state.rewardLocked ? "overridden" : "matches effort";
