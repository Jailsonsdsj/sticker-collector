import type { Epic, Task } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
