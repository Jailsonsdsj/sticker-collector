import { describe, expect, it } from "vitest";
import {
  blockedBySteps,
  MAX_SUBTASKS,
  orderSubtasks,
  type Subtask,
  stepsLeft,
  subtaskDone,
  subtasksDone,
} from "./subtasks.js";

const TODAY = "2026-09-01";
const YESTERDAY = "2026-08-31";

const step = (over: Partial<Subtask> = {}): Subtask => ({
  id: "s1",
  title: "Fill the can",
  position: 0,
  doneOn: null,
  ...over,
});

describe("whether a step counts as done", () => {
  it("is not done when it was never ticked", () => {
    expect(subtaskDone(step(), "routine", TODAY)).toBe(false);
    expect(subtaskDone(step(), "oneoff", TODAY)).toBe(false);
  });

  it("is done for a routine only on the day it was ticked", () => {
    // A routine is a new run every day. A tick from yesterday is the record of
    // yesterday's run, not a head start on today's.
    expect(subtaskDone(step({ doneOn: TODAY }), "routine", TODAY)).toBe(true);
    expect(subtaskDone(step({ doneOn: YESTERDAY }), "routine", TODAY)).toBe(false);
  });

  it("is done for a one-off whenever it was ticked", () => {
    // There is one of it. A step done last week is still done — there is no
    // next run for it to reset into.
    expect(subtaskDone(step({ doneOn: YESTERDAY }), "oneoff", TODAY)).toBe(true);
    expect(subtaskDone(step({ doneOn: "2020-01-01" }), "oneoff", TODAY)).toBe(true);
  });

  it("counts how many are done", () => {
    const steps = [step({ id: "a", doneOn: TODAY }), step({ id: "b" }), step({ id: "c" })];
    expect(subtasksDone(steps, "routine", TODAY)).toBe(1);
  });

  it("counts none of yesterday's ticks for a routine", () => {
    const steps = [step({ id: "a", doneOn: YESTERDAY }), step({ id: "b", doneOn: YESTERDAY })];
    expect(subtasksDone(steps, "routine", TODAY)).toBe(0);
    expect(subtasksDone(steps, "oneoff", TODAY)).toBe(2);
  });
});

describe("the order they are shown in", () => {
  const steps: Subtask[] = [
    step({ id: "a", title: "First", position: 0, doneOn: TODAY }),
    step({ id: "b", title: "Second", position: 1 }),
    step({ id: "c", title: "Third", position: 2, doneOn: TODAY }),
    step({ id: "d", title: "Fourth", position: 3 }),
  ];

  it("puts the undone ones first", () => {
    // What is left is the list you are working through; what is done is the
    // record of having done it.
    expect(orderSubtasks(steps, "routine", TODAY).map((s) => s.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("keeps the author's order inside each group", () => {
    // Two steps never swap places just because a third was ticked.
    const ordered = orderSubtasks(steps, "routine", TODAY);
    expect(ordered.slice(0, 2).map((s) => s.position)).toEqual([1, 3]);
    expect(ordered.slice(2).map((s) => s.position)).toEqual([0, 2]);
  });

  it("leaves the list alone when nothing is done", () => {
    const fresh = steps.map((s) => ({ ...s, doneOn: null }));
    expect(orderSubtasks(fresh, "routine", TODAY).map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("re-sorts a routine's list overnight, because the ticks stopped counting", () => {
    // The same rows, the same day after: yesterday's done steps come back to
    // the top because they are not done any more.
    const yesterdays = steps.map((s) => (s.doneOn ? { ...s, doneOn: YESTERDAY } : s));
    expect(orderSubtasks(yesterdays, "routine", TODAY).map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("does not hand back the array it was given", () => {
    const given = [...steps];
    expect(orderSubtasks(given, "routine", TODAY)).not.toBe(given);
    expect(given.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("survives an empty list", () => {
    expect(orderSubtasks([], "routine", TODAY)).toEqual([]);
  });
});

describe("how many a task may hold", () => {
  it("is capped, so one create stays inside a single D1 batch", () => {
    // One insert per step plus the task itself, and D1 takes 100 statements.
    expect(MAX_SUBTASKS).toBeLessThanOrEqual(99);
    expect(MAX_SUBTASKS).toBeGreaterThan(0);
  });
});

describe("whether the steps block closing", () => {
  const gated = (subtasks: Subtask[], over: Record<string, unknown> = {}) => ({
    blockUntilSteps: true,
    type: "routine" as const,
    subtasks,
    ...over,
  });

  it("blocks while a step is open", () => {
    expect(blockedBySteps(gated([step({ id: "a" })]), TODAY)).toBe(true);
  });

  it("lets go once every step is ticked", () => {
    expect(blockedBySteps(gated([step({ id: "a", doneOn: TODAY })]), TODAY)).toBe(false);
  });

  it("never blocks a task with no steps, however the flag is set", () => {
    // The flag can outlive the list — a task can carry the intention while its
    // checklist is still being written — and clearing the list must not leave
    // behind a task nobody can ever close.
    expect(blockedBySteps(gated([]), TODAY)).toBe(false);
  });

  it("never blocks a task that did not ask to be blocked", () => {
    expect(blockedBySteps(gated([step({ id: "a" })], { blockUntilSteps: false }), TODAY)).toBe(
      false,
    );
  });

  it("judges a routine's steps against the day being closed", () => {
    // Ticking today's steps does not close last Tuesday: those steps were not
    // done on Tuesday, and the board says so too.
    const yesterdays = [step({ id: "a", doneOn: YESTERDAY })];

    expect(blockedBySteps(gated(yesterdays), YESTERDAY)).toBe(false);
    expect(blockedBySteps(gated(yesterdays), TODAY)).toBe(true);
  });

  it("lets a one-off's older ticks count, because it has no next run", () => {
    const older = [step({ id: "a", doneOn: YESTERDAY })];
    expect(blockedBySteps(gated(older, { type: "oneoff" }), TODAY)).toBe(false);
  });

  it("counts what is left, for the message that says so", () => {
    const steps = [step({ id: "a", doneOn: TODAY }), step({ id: "b" }), step({ id: "c" })];
    expect(stepsLeft(steps, "routine", TODAY)).toBe(2);
  });

  it("counts none left when they are all done", () => {
    expect(stepsLeft([step({ id: "a", doneOn: TODAY })], "routine", TODAY)).toBe(0);
  });
});
