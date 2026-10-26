import type { Task } from "@sticker-collector/shared";
import { describe, expect, it } from "vitest";
import { taskStatus } from "./taskStatus";

const TODAY = "2026-10-21";
const ZONE = "America/Sao_Paulo";

type Fields = Pick<Task, "type" | "startedAt" | "dueAt" | "lastCompletedOn" | "refining">;
const task = (over: Partial<Fields> = {}): Fields => ({
  type: "oneoff",
  startedAt: null,
  dueAt: null,
  lastCompletedOn: null,
  refining: false,
  ...over,
});

describe("taskStatus", () => {
  it("reads an untouched task as to do", () => {
    expect(taskStatus(task(), TODAY, ZONE)).toBe("todo");
    expect(taskStatus(task({ type: "routine" }), TODAY, ZONE)).toBe("todo");
  });

  it("reads a finished task as done, even if it was also started or overdue", () => {
    const t = task({
      lastCompletedOn: "2026-10-20",
      startedAt: "2026-10-19T12:00:00Z",
      dueAt: "2026-10-01T12:00:00Z",
    });
    expect(taskStatus(t, TODAY, ZONE)).toBe("done");
  });

  it("reads a started task as in progress, ahead of a missed due date", () => {
    const t = task({ startedAt: "2026-10-01T12:00:00Z", dueAt: "2026-10-02T12:00:00Z" });
    expect(taskStatus(t, TODAY, ZONE)).toBe("inProgress");
  });

  it("drops a routine started on another day back to to do", () => {
    const t = task({ type: "routine", startedAt: "2026-10-20T12:00:00Z" });
    expect(taskStatus(t, TODAY, ZONE)).toBe("todo");
  });

  it("reads a one-off whose due day has gone as missed", () => {
    expect(taskStatus(task({ dueAt: "2026-10-20T15:00:00Z" }), TODAY, ZONE)).toBe("missed");
  });

  it("does not call a task due today missed", () => {
    expect(taskStatus(task({ dueAt: "2026-10-21T15:00:00Z" }), TODAY, ZONE)).toBe("todo");
  });

  it("reads an undated one-off parked in Refine as refine", () => {
    expect(taskStatus(task({ refining: true }), TODAY, ZONE)).toBe("refine");
  });

  it("lets started and done outrank refine", () => {
    expect(
      taskStatus(task({ refining: true, startedAt: "2026-10-20T12:00:00Z" }), TODAY, ZONE),
    ).toBe("inProgress");
    expect(taskStatus(task({ refining: true, lastCompletedOn: "2026-10-20" }), TODAY, ZONE)).toBe(
      "done",
    );
  });

  it("ignores a stale refine flag on a dated one-off", () => {
    expect(taskStatus(task({ refining: true, dueAt: "2026-10-25T12:00:00Z" }), TODAY, ZONE)).toBe(
      "todo",
    );
  });

  it("reads the due day in the user's timezone, not UTC", () => {
    // 01:00 UTC on the 21st is still the evening of the 20th in São Paulo.
    expect(taskStatus(task({ dueAt: "2026-10-21T01:00:00Z" }), TODAY, ZONE)).toBe("missed");
    expect(taskStatus(task({ dueAt: "2026-10-22T01:00:00Z" }), TODAY, ZONE)).toBe("todo");
  });
});
