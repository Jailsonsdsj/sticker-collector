import type { Epic, Task } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EpicCard } from "./EpicCard";

const epic = (over: Partial<Epic> = {}): Epic => ({
  id: "e1",
  title: "Sticker App",
  description: null,
  accent: "epic-1",
  status: "active" as const,
  coinGoalAlbumId: null,
  createdAt: "2026-07-01T00:00:00Z",
  oneOffTotal: 4,
  oneOffDone: 1,
  ...over,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  epicId: "e1",
  title: "Ship it",
  description: null,
  url: null,
  effortMinutes: 30,
  rewardCoins: 30,
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
});

function setup(props: Partial<Parameters<typeof EpicCard>[0]> = {}) {
  const handlers = {
    onToggleExpand: vi.fn(),
    onAddTask: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<EpicCard epic={epic()} tasks={[]} expanded={false} {...handlers} {...props} />);
  return { ...handlers, user: userEvent.setup() };
}

describe("progress", () => {
  it("shows the server's ratio and does not recompute it", () => {
    // The server counts one-off tasks only — routines never finish. If the card
    // derived the ratio from the tasks it was handed, a routine in the list
    // would silently drag every epic below 100%.
    setup({
      epic: epic({ oneOffTotal: 4, oneOffDone: 1 }),
      tasks: [task({ id: "r", type: "routine" }), task({ id: "o" })],
      expanded: true,
    });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("reports the progress bar's value, not just a bar", () => {
    setup({ epic: epic({ oneOffTotal: 4, oneOffDone: 3 }) });
    expect(screen.getByRole("progressbar", { name: /sticker app/i })).toHaveAttribute(
      "aria-valuenow",
      "75",
    );
  });

  it("survives an epic with nothing in it", () => {
    setup({ epic: epic({ oneOffTotal: 0, oneOffDone: 0 }) });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});

describe("expanding", () => {
  it("hides the tasks and the actions until expanded", () => {
    setup({ tasks: [task({ title: "Ship it" })] });
    expect(screen.queryByText("Ship it")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add task/i })).not.toBeInTheDocument();
  });

  it("lists the tasks it was given once expanded", () => {
    setup({
      tasks: [task({ id: "a", title: "Ship it" }), task({ id: "b", title: "Write docs" })],
      expanded: true,
    });
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByText("Write docs")).toBeInTheDocument();
  });

  it("says so when the epic is empty rather than showing a blank list", () => {
    setup({ tasks: [], expanded: true });
    expect(screen.getByText(/nothing in here yet/i)).toBeInTheDocument();
  });

  it("reports its state to assistive tech and asks the parent to toggle", async () => {
    const { onToggleExpand, user } = setup();
    const header = screen.getByRole("button", { expanded: false });
    await user.click(header);
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });
});

describe("actions", () => {
  it("offers add / edit / delete when expanded", async () => {
    const { onAddTask, onEdit, onDelete, user } = setup({ expanded: true });

    await user.click(screen.getByRole("button", { name: /add task/i }));
    expect(onAddTask).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe("finished subtasks", () => {
  const withTasks = (tasks: Task[], props: Partial<Parameters<typeof EpicCard>[0]> = {}) =>
    render(
      <EpicCard
        epic={epic()}
        tasks={tasks}
        expanded
        onToggleExpand={vi.fn()}
        onAddTask={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />,
    );

  const open = task({ id: "a", title: "Ship it" });
  const closed = task({ id: "b", title: "Shipped it", lastCompletedOn: "2026-07-20" });

  it("shows what is left with no heading over it", () => {
    // A heading over the open work would be naming the obvious: the list is
    // the epic.
    withTasks([open, closed]);

    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /to do|open|remaining/i })).toBeNull();
  });

  it("hides finished ones behind a Done divider, folded", async () => {
    // Driven the way the screen drives it: the fold lives in `sectionState` so
    // it survives leaving the tab, which a component-local `useState` would
    // not.
    const Harness = () => {
      const [doneOpen, setDoneOpen] = useState(false);
      return (
        <EpicCard
          epic={epic()}
          tasks={[open, closed]}
          expanded
          doneOpen={doneOpen}
          onToggleDone={() => setDoneOpen((was) => !was)}
          onToggleExpand={vi.fn()}
          onAddTask={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
    };
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByText("Shipped it")).toBeNull();
    const divider = screen.getByRole("button", { name: /done/i });
    expect(divider).toHaveAttribute("aria-expanded", "false");

    await user.click(divider);
    expect(screen.getByText("Shipped it")).toBeInTheDocument();
  });

  it("counts them while they are folded away", () => {
    // Folding a section should not also hide how much is in it.
    withTasks(
      [open, closed, task({ id: "c", title: "Also done", lastCompletedOn: "2026-07-21" })],
      {
        onToggleDone: vi.fn(),
      },
    );

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("says nothing about Done when nothing is", () => {
    withTasks([open], { onToggleDone: vi.fn() });

    expect(screen.queryByRole("button", { name: /done/i })).toBeNull();
  });

  it("keeps a task inside its undo window out of Done", () => {
    // Moving a row the instant it is ticked would make the undo button chase a
    // row that had already left.
    withTasks([open], { isCompleting: () => true, doneOpen: true, onToggleDone: vi.fn() });

    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /complete ship it/i })).toBeChecked();
    expect(screen.queryByRole("button", { name: /done/i })).toBeNull();
  });

  it("shows a long task title in full rather than truncating it", () => {
    // A task row inside an epic card is the narrowest place a title appears.
    const long = "Draft the quarterly report and circulate it for review";
    withTasks([task({ id: "z", title: long })], { onOpenTask: vi.fn() });

    expect(screen.getByRole("button", { name: long }).className).not.toContain("truncate");
  });
});

describe("the order tasks read in", () => {
  const withTasks = (tasks: Task[]) =>
    render(
      <EpicCard
        epic={epic()}
        tasks={tasks}
        expanded
        onToggleExpand={vi.fn()}
        onAddTask={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        doneOpen
        onToggleDone={vi.fn()}
      />,
    );

  /** Row text is "↻Title+30" — the marker and the reward are not the order. */
  const titles = () =>
    screen
      .getAllByRole("listitem")
      .map((row) => (row.textContent ?? "").replace(/^↻/, "").replace(/\+\d+$/, ""));

  it("puts one-offs first and routines after", () => {
    // A one-off is what the epic finishes and the only thing its progress bar
    // counts; a routine never finishes, so leading with one buries the work the
    // epic is measured by.
    withTasks([
      task({ id: "r1", title: "Daily standup", type: "routine", weekdays: 0b1111111 }),
      task({ id: "o1", title: "Ship it" }),
      task({ id: "r2", title: "Weekly review", type: "routine", weekdays: 0b0000001 }),
      task({ id: "o2", title: "Write the README" }),
    ]);

    expect(titles()).toEqual(["Ship it", "Write the README", "Daily standup", "Weekly review"]);
  });

  it("keeps the order it was given within each kind", () => {
    // A stable sort on the type alone: the list should not acquire a new
    // ordering nobody asked for.
    withTasks([
      task({ id: "b", title: "Second" }),
      task({ id: "a", title: "First" }),
      task({ id: "r", title: "Routine", type: "routine", weekdays: 0b1111111 }),
    ]);

    expect(titles()[0]).toContain("Second");
    expect(titles()[1]).toContain("First");
  });

  it("orders the Done list the same way", () => {
    // Two lists, one rule — a finished routine above a finished one-off would
    // read as a different screen.
    withTasks([
      task({
        id: "r",
        title: "Daily standup",
        type: "routine",
        weekdays: 0b1111111,
        lastCompletedOn: "2026-08-20",
      }),
      task({ id: "o", title: "Ship it", lastCompletedOn: "2026-08-20" }),
    ]);

    expect(titles()[0]).toContain("Ship it");
    expect(titles()[1]).toContain("Daily standup");
  });
});
