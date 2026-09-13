import type { Task } from "@sticker-collector/shared";
import { WEEKDAYS_MASK_WEEKDAYS } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { schedule, TaskView } from "./TaskView";

const TODAY = "2026-09-05";

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
    subtasks: [],
    blockUntilSteps: false,
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

  it("keeps the secondary actions in one row, not a stack", () => {
    // The original reason for the row: stacked, the actions pushed Delete up
    // towards the thumb. Done has since moved to a full-width row of its own,
    // and the count of rows is unchanged — so that concern still holds.
    open({ onToggleToday: vi.fn() });

    const editButton = screen.getByRole("button", { name: "Edit" });
    const todayButton = screen.getByRole("button", { name: "For today" });
    expect(todayButton.parentElement).toBe(editButton.parentElement);
    // A row, not a column: "flex" alone is true of the stack this replaced.
    expect(editButton.parentElement?.className).toContain("flex");
    expect(editButton.parentElement?.className).not.toContain("flex-col");
    expect(editButton.className).toContain("flex-1");
    expect(todayButton.className).toContain("flex-1");
  });

  it("gives Done the full width, below the rest", () => {
    // The thing this sheet is most often opened to press, and the widest
    // target is the easiest to hit with a thumb.
    open({ onToggleToday: vi.fn() });

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton.className).toContain("w-full");
    expect(doneButton.parentElement).not.toBe(
      screen.getByRole("button", { name: "Edit" }).parentElement,
    );
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

  it("offers Start in the middle of the row, before Edit", () => {
    // Start was asked for "between Done and Edit", and it stayed put — Done is
    // what moved out from beside it, down to a row of its own.
    openWithStart();

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((text) => ["For today", "Start", "Edit", "Done"].includes(text ?? ""));
    expect(labels).toEqual(["Start", "Edit", "Done"]);
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

describe("a task that waits for its steps", () => {
  const gated = (over: Partial<Task> = {}) =>
    task({
      blockUntilSteps: true,
      subtasks: [
        { id: "a", title: "Write it", position: 0, doneOn: null },
        { id: "b", title: "Send it", position: 1, doneOn: null },
      ],
      ...over,
    });

  it("says so before the button is pressed, not after it is refused", () => {
    // Being told "no" by a button you already tapped is a worse way to learn a
    // rule than seeing it stated beside the steps it is about.
    open({ task: gated(), today: TODAY, onToggleSubtask: vi.fn() });

    expect(screen.getByRole("status")).toHaveTextContent(/2 of 2 left/);
  });

  it("will not let Done be pressed while a step is open", () => {
    open({ task: gated(), today: TODAY, onToggleSubtask: vi.fn() });

    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });

  it("lets go once every step is ticked", () => {
    const finished = gated({
      subtasks: [
        { id: "a", title: "Write it", position: 0, doneOn: TODAY },
        { id: "b", title: "Send it", position: 1, doneOn: TODAY },
      ],
    });
    open({ task: finished, today: TODAY, onToggleSubtask: vi.fn() });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("still lets a finished one be reopened", () => {
    // Someone who ticked by mistake has to be able to undo it: the gate is on
    // closing, not on correcting.
    open({ task: gated(), today: TODAY, done: true, onToggleSubtask: vi.fn() });

    expect(screen.getByRole("button", { name: "Reopen" })).toBeEnabled();
  });

  it("says nothing on a task that never asked to be blocked", () => {
    open({ task: gated({ blockUntilSteps: false }), today: TODAY, onToggleSubtask: vi.fn() });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("says nothing on a task with no steps, however the flag is set", () => {
    open({ task: gated({ subtasks: [] }), today: TODAY, onToggleSubtask: vi.fn() });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });
});

describe("the steps, wherever the sheet is opened from", () => {
  const withSteps = (over: Partial<Task> = {}) =>
    task({
      subtasks: [
        { id: "a", title: "Write it", position: 0, doneOn: null },
        { id: "b", title: "Send it", position: 1, doneOn: null },
      ],
      ...over,
    });

  it("shows them whenever the sheet knows which day it is about", () => {
    // The bug: the Week and Epics tabs open this same sheet and rendered it
    // without a `today`, so the steps were simply not there.
    open({ task: withSteps(), today: TODAY });

    expect(screen.getByText("Write it")).toBeInTheDocument();
    expect(screen.getByText("Send it")).toBeInTheDocument();
  });

  it("shows them read-only when they cannot be ticked from here", () => {
    // A past day on the Week tab: a tick is stamped with the server's today,
    // so a box on Tuesday's sheet would record Thursday and appear to miss.
    open({ task: withSteps(), today: TODAY });

    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });

  it("lets them be ticked when a handler is given", () => {
    open({ task: withSteps(), today: TODAY, onToggleSubtask: vi.fn() });

    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeEnabled();
  });

  it("shows nothing when the sheet does not know its day", () => {
    // Not a silent omission any more — this is the one case where absent is
    // correct, and it is asserted rather than assumed.
    open({ task: withSteps() });

    expect(screen.queryByText("Write it")).not.toBeInTheDocument();
  });
});

describe("bringing a task forward to today", () => {
  it("offers the button the left swipe's gesture already offered", () => {
    // The swipe was the only way to do this, and a gesture is not discoverable
    // from a sheet that lists every other action as a button.
    open({ task: task(), onToggleToday: vi.fn() });

    expect(screen.getByRole("button", { name: "For today" })).toBeInTheDocument();
  });

  it("says the opposite once it is already waiting for today", () => {
    open({ task: task(), onToggleToday: vi.fn(), pinnedToday: true });

    expect(screen.getByRole("button", { name: "Not today" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "For today" })).not.toBeInTheDocument();
  });

  it("reports the tap", async () => {
    const user = userEvent.setup();
    const onToggleToday = vi.fn();
    open({ task: task(), onToggleToday });

    await user.click(screen.getByRole("button", { name: "For today" }));

    expect(onToggleToday).toHaveBeenCalledOnce();
  });

  it("stays away where the gesture would do nothing", () => {
    // A routine follows its own schedule and a dated one-off already has a
    // day; the caller decides, the same way it decides for the swipe.
    open({ task: task() });

    expect(screen.queryByRole("button", { name: /today/i })).not.toBeInTheDocument();
  });

  it("stays away on a finished task", () => {
    // Bringing back something you have just closed is not a state the list can
    // place — the same reason Start is withheld there.
    open({ task: task(), onToggleToday: vi.fn(), done: true });

    expect(screen.queryByRole("button", { name: /today/i })).not.toBeInTheDocument();
  });
});

describe("where the actions sit", () => {
  it("puts For today first in the row and Done full width beneath", () => {
    // The positions were swapped on request: Done had the row's first slot and
    // For today the full-width line below it.
    open({ onToggleToday: vi.fn(), onToggleStart: vi.fn() });

    const order = screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) => ["For today", "Start", "Edit", "Done"].includes(t ?? ""));

    expect(order).toEqual(["For today", "Start", "Edit", "Done"]);
  });

  it("still stacks into two rows and no more, so Delete does not climb", () => {
    // The row exists because a stack pushed Delete up towards the thumb. Four
    // actions across two rows is what it was before the swap, and after it.
    open({ onToggleToday: vi.fn(), onToggleStart: vi.fn() });

    const rows = new Set(
      ["For today", "Start", "Edit", "Done"].map(
        (name) => screen.getByRole("button", { name }).parentElement,
      ),
    );
    expect(rows.size).toBe(2);
  });

  it("leaves Reopen full width on a finished task", () => {
    open({ onToggleToday: vi.fn(), done: true });

    expect(screen.getByRole("button", { name: "Reopen" }).className).toContain("w-full");
  });
});
