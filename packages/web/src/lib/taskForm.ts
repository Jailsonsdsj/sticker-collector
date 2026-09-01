import {
  type CreateTaskInput,
  clockToMinutes,
  DEFAULT_EFFORT_MINUTES,
  MAX_SUBTASKS,
  maskHasDay,
  maskToggleDay,
  minutesToClock,
  type Priority,
  type RoutineSlot,
  type Task,
  type TaskType,
  type UpdateTask,
  WEEKDAYS_MASK_NONE,
  type Weekday,
} from "@sticker-collector/shared";
import { today } from "./timezone";

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
  /**
   * When the routine runs, keyed by weekday, as the `HH:MM` strings a time
   * input produces.
   *
   * Held as strings rather than minutes because a half-typed "1" is a state the
   * user passes through, and a number field cannot represent it.
   */
  slots: Record<number, { start: string; end: string }>;
  /** Set the moment the user edits effort; from then on a slot's length stops
   *  filling it in. */
  effortLocked: boolean;
  /** "Do this today" — lifts an undated capture into the For today section. */
  pinnedToday: boolean;
  /**
   * The steps, as typed.
   *
   * A plain array of strings, blanks included: a row the user has opened but
   * not filled is a state they pass through, and dropping it as they type would
   * take the field away mid-keystroke. Blanks are trimmed away on the way out.
   */
  subtasks: string[];
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
  | { kind: "pinToday"; value: boolean }
  | { kind: "slot"; weekday: Weekday; field: "start" | "end"; value: string }
  | { kind: "priority"; value: Priority }
  | { kind: "epic"; value: string | null }
  | { kind: "subtask"; index: number; value: string }
  | { kind: "addSubtask" }
  | { kind: "removeSubtask"; index: number };

/**
 * Effort presets, shortest first. Seven of them no longer fit across a phone,
 * so `EffortFields` scrolls the row sideways rather than wrapping or shrinking
 * each chip below a comfortable tap target.
 */
export const EFFORT_PRESETS = [5, 10, 15, 30, 60, 90, 120] as const;

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
    // One-off is both the first tab and the default: quick-add already creates
    // one-offs, so the full form starting anywhere else made the two disagree.
    type: "oneoff",
    weekdays: WEEKDAYS_MASK_NONE,
    dueDate: "",
    dueTime: "",
    // The same 30 the server gives a quick-add. A blank effort field made the
    // full form a worse capture than the one-line box beside it: two taps of
    // typing before Save would even light up, for a number most tasks were
    // going to be anyway.
    effortMinutes: String(DEFAULT_EFFORT_MINUTES),
    // Filled, not merely placeholdered: a coin IS a minute, and an empty box
    // under a filled one reads as a decision still to make. It keeps mirroring
    // the effort until the user types over it — `rewardLocked` is what stops
    // that, and typing here is what sets it.
    rewardCoins: String(DEFAULT_EFFORT_MINUTES),
    slots: {},
    // The default effort is the form's suggestion, not the user's answer, so a
    // slot may still overwrite it.
    effortLocked: false,
    rewardLocked: false,
    pinnedToday: false,
    subtasks: [],
    priority: "medium",
    epicId: options.epicId ?? null,
  };
}

/**
 * The steps worth sending: trimmed, and blanks dropped.
 *
 * An empty row is a row the user opened and left, not a step called "". They
 * are kept in the form's own state so the field does not vanish mid-keystroke,
 * and removed here, at the one place the state becomes a payload.
 */
export function cleanSubtasks(state: TaskFormState): string[] {
  return state.subtasks.map((title) => title.trim()).filter((title) => title !== "");
}

export function reduce(state: TaskFormState, action: TaskFormAction): TaskFormState {
  switch (action.kind) {
    case "subtask": {
      const subtasks = [...state.subtasks];
      subtasks[action.index] = action.value;
      return { ...state, subtasks };
    }

    case "addSubtask":
      // Capped so one task cannot outgrow the single batch its create is
      // written in. The button goes away at the ceiling rather than failing.
      return state.subtasks.length >= MAX_SUBTASKS
        ? state
        : { ...state, subtasks: [...state.subtasks, ""] };

    case "removeSubtask":
      return { ...state, subtasks: state.subtasks.filter((_, i) => i !== action.index) };

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

    case "pinToday":
      return { ...state, pinnedToday: action.value };

    case "weekday": {
      const weekdays = maskToggleDay(state.weekdays, action.value);
      const slots = { ...state.slots };

      if (maskHasDay(weekdays, action.value)) {
        // A newly checked day copies the first time already entered. "Same time
        // every day" is the common case, and typing it seven times is the kind
        // of chore that makes people leave the field blank.
        slots[action.value] = slots[action.value] ??
          firstSlot(state.slots) ?? { start: "", end: "" };
      } else {
        // Unchecking a day drops its time with it: the API refuses a slot on a
        // day the mask does not include, so keeping it would only be a 400
        // waiting to happen.
        delete slots[action.value];
      }

      return { ...state, weekdays, slots };
    }

    case "dueDate":
    case "dueTime":
      return { ...state, [action.kind]: action.value };

    case "effort":
      // One minute of effort is one coin, until the user says otherwise.
      return {
        ...state,
        effortMinutes: action.value,
        rewardCoins: state.rewardLocked ? state.rewardCoins : action.value,
        effortLocked: true,
      };

    case "slot": {
      const current = state.slots[action.weekday] ?? { start: "", end: "" };
      const slots = {
        ...state.slots,
        [action.weekday]: { ...current, [action.field]: action.value },
      };

      // A slot's length suggests the effort — 12:00–14:00 is 120 minutes — but
      // only until the user types an effort of their own. The slot says WHEN;
      // effort is what the task pays, and a two-hour window booked for twenty
      // minutes of work must not mint 120 coins by construction.
      const minutes = slotLength(slots[action.weekday]);
      const effortMinutes =
        !state.effortLocked && minutes !== null ? String(minutes) : state.effortMinutes;

      return {
        ...state,
        slots,
        effortMinutes,
        rewardCoins: state.rewardLocked ? state.rewardCoins : effortMinutes,
      };
    }

    case "reward":
      return { ...state, rewardCoins: action.value, rewardLocked: true };

    case "priority":
      return { ...state, priority: action.value };

    case "epic":
      return { ...state, epicId: action.value };
  }
}

/** The first time already entered, in weekday order — what a newly checked day
 *  copies. */
function firstSlot(slots: TaskFormState["slots"]): { start: string; end: string } | null {
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    const slot = slots[weekday];
    if (slot?.start && slot.end) return { ...slot };
  }
  return null;
}

/** How long a slot is, or null if it is not yet a slot. */
function slotLength(slot: { start: string; end: string } | undefined): number | null {
  if (!slot) return null;
  const start = clockToMinutes(slot.start);
  const end = clockToMinutes(slot.end);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

/**
 * The slots as the API wants them, or null if any checked day is unfinished.
 *
 * Days outside the mask are dropped rather than reported: unchecking a day is
 * how you remove its time, and the state may still hold one from before.
 */
export function toSlots(state: TaskFormState): RoutineSlot[] | null {
  const slots: RoutineSlot[] = [];

  for (const weekday of [0, 1, 2, 3, 4, 5, 6] as Weekday[]) {
    if (!maskHasDay(state.weekdays, weekday)) continue;

    const entry = state.slots[weekday];
    if (!entry?.start && !entry?.end) continue; // never filled in

    const start = clockToMinutes(entry?.start ?? "");
    const end = clockToMinutes(entry?.end ?? "");
    if (start === null || end === null || end <= start) return null;

    slots.push({ weekday, startMin: start, endMin: end });
  }

  return slots;
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
  if (state.type === "routine" && toSlots(state) === null) {
    return "Each day needs a start and an end, and the end must be later.";
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
    subtasks: cleanSubtasks(state),
    url: state.url.trim() || null,
    epicId: state.epicId,
    effortMinutes,
    // Omitted rather than mirrored when untouched, so the schema's own
    // "reward defaults to effort" rule is the single source of that behaviour.
    rewardCoins: state.rewardLocked ? Number(state.rewardCoins) : undefined,
    priority: state.priority,
  };

  return state.type === "routine"
    ? { ...common, type: "routine", weekdays: state.weekdays, slots: toSlots(state) ?? [] }
    : {
        ...common,
        type: "oneoff",
        dueAt: toDueAt(state.dueDate, state.dueTime),
        // Only an UNDATED one-off may be pinned: the API validates a fresh
        // completion against the schedule, and that is its single exception.
        pinnedOn: state.pinnedToday && !state.dueDate ? today() : null,
      };
}

/** What the reward field's hint should say — the design's `rewardHint`. */
export const rewardHint = (state: TaskFormState) =>
  state.rewardLocked ? "overridden" : "matches effort";

/**
 * A UTC instant back into the local date and time the pickers show — the exact
 * inverse of `toDueAt`. Local getters, not UTC ones: otherwise every reopen of
 * the form shifts the due time by the user's offset, a little further each time.
 */
export function splitDueAt(instant: string | null): { dueDate: string; dueTime: string } {
  if (!instant) return { dueDate: "", dueTime: "" };
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return { dueDate: "", dueTime: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dueDate: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    dueTime: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

/** Seeds the form from an existing task, for editing. */
export function stateFromTask(task: Task): TaskFormState {
  const { dueDate, dueTime } = splitDueAt(task.dueAt);
  return {
    title: task.title,
    description: task.description ?? "",
    url: task.url ?? "",
    type: task.type,
    weekdays: task.weekdays ?? WEEKDAYS_MASK_NONE,
    dueDate,
    dueTime,
    effortMinutes: String(task.effortMinutes),
    rewardCoins: String(task.rewardCoins),
    // A task whose reward equals its effort was never overridden, so it keeps
    // tracking. One that differs stays pinned — editing effort must not quietly
    // rewrite a number the user chose deliberately.
    rewardLocked: task.rewardCoins !== task.effortMinutes,
    // Pinned yesterday is not pinned today — the date is the whole reason the
    // flag is a date, so a stale pin reads as unpinned rather than as a choice.
    pinnedToday: task.pinnedOn === today(),
    slots: Object.fromEntries(
      task.slots.map((slot) => [
        slot.weekday,
        { start: minutesToClock(slot.startMin), end: minutesToClock(slot.endMin) },
      ]),
    ),
    // Editing: effort is whatever the task already says, and a slot must not
    // silently rewrite it.
    effortLocked: true,
    // The titles only. Their ticks live on the server and are not the form's
    // business — editing the list replaces it, which is what clears them.
    subtasks: task.subtasks.map((step) => step.title),
    priority: task.priority,
    epicId: task.epicId,
  };
}

/**
 * Only what changed.
 *
 * A full payload would be refused three ways: `updateTaskSchema` is strict and
 * rejects `type` (fixed at creation); the API rejects a one-off carrying
 * `weekdays` or a routine carrying `dueAt`; and a patch with no fields at all
 * is itself a 400. Null means nothing changed — there is nothing to send.
 */
export function toPatch(state: TaskFormState, original: Task): UpdateTask | null {
  if (validate(state) !== null) return null;

  const patch: Record<string, unknown> = {};
  const set = (key: string, next: unknown, previous: unknown) => {
    if (next !== previous) patch[key] = next;
  };

  set("title", state.title.trim(), original.title);
  set("description", state.description.trim() || null, original.description);
  // Compared as a list, because order is part of what the author chose. Sending
  // it unchanged would be harmless but not free: the server replaces the rows,
  // which throws away every tick.
  const steps = cleanSubtasks(state);
  const before = original.subtasks.map((step) => step.title);
  if (steps.length !== before.length || steps.some((title, i) => title !== before[i])) {
    patch.subtasks = steps;
  }
  set("url", state.url.trim() || null, original.url);
  set("epicId", state.epicId, original.epicId);
  set("effortMinutes", Number(state.effortMinutes), original.effortMinutes);
  set(
    "rewardCoins",
    Number(state.rewardCoins === "" ? state.effortMinutes : state.rewardCoins),
    original.rewardCoins,
  );
  set("priority", state.priority, original.priority);

  // Pin/unpin, but only where it can mean anything: the completion guard lets
  // an arbitrary "today" through for undated one-offs alone.
  if (original.type === "oneoff" && !state.dueDate) {
    const localToday = today();
    set("pinnedOn", state.pinnedToday ? localToday : null, original.pinnedOn);
  }

  // The task's own type decides which schedule may be sent, not the form's.
  if (original.type === "routine") {
    set("weekdays", state.weekdays, original.weekdays);
    // Compared as JSON: `slots` is the whole set, and sending an unchanged one
    // would make every rename rewrite the agenda's rows for nothing.
    const next = toSlots(state) ?? [];
    if (JSON.stringify(next) !== JSON.stringify(original.slots)) patch.slots = next;
  } else {
    set("dueAt", toDueAt(state.dueDate, state.dueTime), original.dueAt);
  }

  return Object.keys(patch).length > 0 ? (patch as UpdateTask) : null;
}
