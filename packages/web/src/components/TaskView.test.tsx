import type { Task } from "@sticker-collector/shared";
import { WEEKDAYS_MASK_WEEKDAYS } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { schedule, TaskView } from "./TaskView";

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1",
    epicId: null,
    title: "Water the plants",
    description: "The big one by the window first.",
    url: null,
    effortMinutes: 15,
    rewardCoins: 15,
    priority: "medium",
    type: "oneoff",
    weekdays: null,
    startsOn: null,
    endsOn: null,
    dueAt: null,
    pinnedOn: null,
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
    ...over,
  }) as Task;

const open = (props: Partial<Parameters<typeof TaskView>[0]> = {}) => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggleDone = vi.fn();
  const onClose = vi.fn();
  render(
    <TaskView
      task={task()}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggleDone={onToggleDone}
      onClose={onClose}
      {...props}
    />,
  );
  return { onEdit, onDelete, onToggleDone, onClose };
};

describe("reading a task", () => {
  it("leads with the title and the words", () => {
    // The reason this screen exists: the description used to be a <textarea>
    // two fields down an edit form.
    open();

    expect(screen.getByRole("heading", { name: "Water the plants" })).toBeInTheDocument();
    expect(screen.getByText("The big one by the window first.")).toBeInTheDocument();
  });

  it("says there is no description rather than leaving a hole", () => {
    open({ task: task({ description: null }) });

    expect(screen.getByText("No description.")).toBeInTheDocument();
  });

  it("shows what it is worth and what it costs", () => {
    open({ task: task({ rewardCoins: 40, effortMinutes: 25 }) });

    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("25 min")).toBeInTheDocument();
  });

  it("does not edit anything by being open", () => {
    // It replaced a form. Nothing here may be a field.
    open();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("what can be done from here", () => {
  it("offers Done, Edit and Delete", async () => {
    const user = userEvent.setup();
    const { onToggleDone, onEdit } = open();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onToggleDone).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();

    expect(screen.getByRole("button", { name: /delete task/i })).toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    const user = userEvent.setup();
    const { onDelete } = open();

    await user.click(screen.getByRole("button", { name: /delete task/i }));

    // The same two-step the edit form uses — one affordance, one confirmation.
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("reads Reopen once the task is closed", () => {
    open({ done: true });

    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });

  it("hides the action entirely when the task cannot be closed from here", () => {
    // A routine on a day its schedule does not cover: the API answers 400, and
    // a button that always fails is worse than no button.
    open({ onToggleDone: undefined });

    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

describe("when it happens, in words", () => {
  it("reads a weekday mask Monday-first", () => {
    // Bit 0 is Monday. A Sunday-first reading names the wrong days and looks
    // entirely plausible.
    expect(schedule(task({ type: "routine", weekdays: WEEKDAYS_MASK_WEEKDAYS }))).toBe(
      "Mon, Tue, Wed, Thu, Fri",
    );
    expect(schedule(task({ type: "routine", weekdays: 0b1000000 }))).toBe("Sun");
    expect(schedule(task({ type: "routine", weekdays: 0b0000001 }))).toBe("Mon");
  });

  it("names the everyday and the never cases", () => {
    expect(schedule(task({ type: "routine", weekdays: 0b1111111 }))).toBe("Every day");
    expect(schedule(task({ type: "routine", weekdays: 0 }))).toBe("No days set");
  });

  it("says when a one-off is due, or that it is not", () => {
    expect(schedule(task({ dueAt: "2026-08-09T00:00:00Z" }))).toBe("Due 2026-08-09");
    expect(schedule(task())).toBe("Any day");
  });
});
