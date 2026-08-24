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
    startedAt: null,
    slots: [],
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

  it("keeps the line breaks the author typed", () => {
    // The form gives six rows to write in; a list of steps written as a list
    // arrived here as one run-on paragraph, because HTML collapses newlines.
    //
    // Markdown collapses them too — one newline is a space by its own rules —
    // so this is the assertion that catches the description being silently
    // reflowed. It asserts the *result*, not `whitespace-pre-line`, because the
    // promise is "the lines stay lines" and not any one way of keeping it.
    const steps = "Water the big one.\nThen the herbs.\nSkip the cactus.";
    open({ task: task({ description: steps }) });

    const paragraph = screen.getByText(/Skip the cactus/);
    expect(paragraph.querySelectorAll("br")).toHaveLength(2);
    expect(paragraph.textContent).toBe(steps);
  });

  it("renders the formatting the author wrote, rather than its punctuation", () => {
    open({ task: task({ description: "Water the **big** one, then the *herbs*." }) });

    expect(screen.getByText("big").tagName).toBe("STRONG");
    expect(screen.getByText("herbs").tagName).toBe("EM");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
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

  it("puts Done and Edit side by side", () => {
    // The two things you came here to do. Stacked, they pushed Delete up
    // towards the thumb.
    open();

    const doneButton = screen.getByRole("button", { name: "Done" });
    const editButton = screen.getByRole("button", { name: "Edit" });
    expect(doneButton.parentElement).toBe(editButton.parentElement);
    // A row, not a column: "flex" alone is true of the stack this replaced.
    expect(doneButton.parentElement?.className).toContain("flex");
    expect(doneButton.parentElement?.className).not.toContain("flex-col");
    // Each takes half; neither is a full-width block any more.
    expect(doneButton.className).toContain("flex-1");
    expect(editButton.className).toContain("flex-1");
  });

  it("gives Edit the whole row when the task cannot be closed from here", () => {
    open({ onToggleDone: undefined });

    const editButton = screen.getByRole("button", { name: "Edit" });
    expect(editButton.parentElement?.children).toHaveLength(1);
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

describe("picking a task up", () => {
  const openWithStart = (props: Partial<Parameters<typeof TaskView>[0]> = {}) => {
    const onToggleStart = vi.fn();
    const rest = open({ onToggleStart, ...props });
    return { ...rest, onToggleStart };
  };

  it("offers Start between Done and Edit", () => {
    // The order is the order the actions are wanted in, and the user asked for
    // this one in the middle.
    openWithStart();

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((text) => ["Done", "Start", "Edit"].includes(text ?? ""));
    expect(labels).toEqual(["Done", "Start", "Edit"]);
  });

  it("hands the press back", async () => {
    const user = userEvent.setup();
    const { onToggleStart } = openWithStart();

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(onToggleStart).toHaveBeenCalledOnce();
  });

  it("reads Stop once the task is already going", () => {
    openWithStart({ started: true });

    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });

  it("stays away when starting would move nothing", () => {
    // A routine on a day it does not run: *In progress* takes it through
    // today's occurrence only, so the flag would be set and nothing would move.
    open({ onToggleStart: undefined });

    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });

  it("stays away on a task already finished", () => {
    // Starting what you just closed is not a state the list can place.
    openWithStart({ done: true });

    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
  });
});
