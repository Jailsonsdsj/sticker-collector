import type { Occurrence, Task } from "@sticker-collector/shared";
import { addDays, todayIn, WEEKDAYS_MASK_WEEKDAYS } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionQueueProvider } from "../lib/completionQueue";
import { Tasks } from "./Tasks";

/**
 * Multi-select on the home screen.
 *
 * The rows are occurrences and the API takes task ids, so the interesting
 * assertions are about that gap: one routine spans several rows, and picking
 * any of them must mark all of them and send its id exactly once.
 */

const TODAY = todayIn("UTC");

const task = (over: Partial<Task>): Task => ({
  id: "t1",
  epicId: null,
  title: "Stretch",
  description: null,
  url: null,
  effortMinutes: 15,
  rewardCoins: 15,
  priority: "medium",
  type: "routine",
  weekdays: WEEKDAYS_MASK_WEEKDAYS,
  startsOn: null,
  endsOn: null,
  dueAt: null,
  pinnedOn: null,
  createdAt: "2026-07-01T00:00:00Z",
  deletedAt: null,
  lastCompletedOn: null,
  ...over,
});

const TASKS: Task[] = [
  task({ id: "t1", title: "Stretch", weekdays: 0b1111111 }),
  task({ id: "t2", title: "Buy milk", type: "oneoff", weekdays: null }),
];

// The same routine on three different days: three rows, one task.
const OCCURRENCES: Occurrence[] = [-2, -1, 0].map((offset) => ({
  taskId: "t1",
  scheduledOn: addDays(TODAY, offset),
  status: offset === 0 ? "pending" : "missed",
  completedAt: null,
  rewardSnapshotCoins: null,
}));

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <CompletionQueueProvider onCommit={async () => undefined}>
          {children}
        </CompletionQueueProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const read = (init?.method ?? "GET") === "GET";
    if (read && url.startsWith("/api/occurrences")) return json(OCCURRENCES);
    if (read && url.startsWith("/api/tasks")) return json(TASKS);
    if (read && url.startsWith("/api/epics")) return json([]);
    if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
    return json({ deleted: 1 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const dialog = () => within(document.querySelector("dialog[open]") as HTMLElement);
const bodyOf = (path: string) => {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === "POST");
  return call ? JSON.parse(call[1].body as string) : undefined;
};

async function enterSelection() {
  const user = userEvent.setup();
  render(<Tasks />, { wrapper });
  await waitFor(() => expect(screen.getByText("Buy milk")).toBeInTheDocument());

  // Missed starts folded — it is reference, not work in hand — and these tests
  // are about a routine spanning several days, most of which are missed ones.
  const missed = screen.queryByRole("button", { name: /Missed/ });
  if (missed && missed.getAttribute("aria-expanded") === "false") await user.click(missed);

  await user.click(screen.getByRole("button", { name: "Select" }));
  return user;
}

describe("entering the mode", () => {
  it("replaces quick-add and the form button with the selection bar", async () => {
    await enterSelection();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /quick-add/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /full form/i })).not.toBeInTheDocument();
  });

  it("offers no action until something is picked", async () => {
    await enterSelection();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

describe("selection is by task, not by row", () => {
  it("marks every row of a routine when one of them is picked", async () => {
    const user = await enterSelection();
    const boxes = screen.getAllByRole("checkbox", { name: "Select Stretch" });
    expect(boxes.length).toBeGreaterThan(1); // the same task, several days

    await user.click(boxes[0] as HTMLElement);

    // The blast radius is on screen before the action, not after it.
    for (const box of screen.getAllByRole("checkbox", { name: "Select Stretch" })) {
      expect(box).toBeChecked();
    }
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("sends the id once, however many of its rows were tapped", async () => {
    const user = await enterSelection();
    const boxes = () => screen.getAllByRole("checkbox", { name: "Select Stretch" });

    await user.click(boxes()[0] as HTMLElement);
    await user.click(screen.getByRole("checkbox", { name: "Select Buy milk" }));

    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => expect(bodyOf("/api/tasks/bulk-duplicate")).toEqual({ ids: ["t1", "t2"] }));
  });
});

describe("the two actions", () => {
  it("duplicates without asking — nothing is destroyed", async () => {
    const user = await enterSelection();
    await user.click(screen.getByRole("checkbox", { name: "Select Buy milk" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => expect(bodyOf("/api/tasks/bulk-duplicate")).toEqual({ ids: ["t2"] }));
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("asks before deleting, and says the coins are kept", async () => {
    const user = await enterSelection();
    await user.click(screen.getByRole("checkbox", { name: "Select Buy milk" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(bodyOf("/api/tasks/bulk-delete")).toBeUndefined(); // nothing sent yet
    expect(dialog().getByText(/coins they already earned are kept/i)).toBeInTheDocument();

    await user.click(dialog().getByRole("button", { name: /delete 1/i }));
    await waitFor(() => expect(bodyOf("/api/tasks/bulk-delete")).toEqual({ ids: ["t2"] }));
  });

  it("sends nothing when the confirmation is dismissed", async () => {
    const user = await enterSelection();
    await user.click(screen.getByRole("checkbox", { name: "Select Buy milk" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(dialog().getByRole("button", { name: "Cancel" }));

    expect(bodyOf("/api/tasks/bulk-delete")).toBeUndefined();
    expect(screen.getByText("1 selected")).toBeInTheDocument(); // still selected
  });
});

describe("leaving the mode", () => {
  it("drops the selection, so it cannot be reused by accident", async () => {
    const user = await enterSelection();
    await user.click(screen.getByRole("checkbox", { name: "Select Buy milk" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Select" }));

    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("restores quick-add and completion", async () => {
    const user = await enterSelection();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("textbox", { name: /quick-add/i })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: "Stretch" }).length).toBeGreaterThan(0);
  });
});

describe("tapping a task", () => {
  const openScreen = async () => {
    const user = userEvent.setup();
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));
    return user;
  };

  it("reads it rather than opening the editor", async () => {
    const user = await openScreen();

    await user.click(screen.getAllByRole("button", { name: "Buy milk" })[0] as HTMLElement);

    // Asking "what is this again?" should not begin by putting the task at
    // risk: the view first, the form only if asked for.
    expect(dialog().getByRole("heading", { name: "Buy milk" })).toBeInTheDocument();
    expect(dialog().queryByDisplayValue("Buy milk")).toBeNull();
  });

  it("hands over to the editor on Edit", async () => {
    const user = await openScreen();
    await user.click(screen.getAllByRole("button", { name: "Buy milk" })[0] as HTMLElement);

    await user.click(dialog().getByRole("button", { name: "Edit" }));

    // One sheet at a time: the view closes as the form opens, or Escape lands
    // on whichever of the two the browser happens to prefer.
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
    expect(dialog().getByDisplayValue("Buy milk")).toBeInTheDocument();
  });

  it("closes the task from the view", async () => {
    const user = await openScreen();
    await user.click(screen.getAllByRole("button", { name: "Buy milk" })[0] as HTMLElement);

    await user.click(dialog().getByRole("button", { name: "Done" }));

    // Back to the list, with the row ticked — the tick goes through the same
    // undo queue as the row's own checkbox.
    expect(document.querySelector("dialog[open]")).toBeNull();
    await waitFor(() => {
      const row = screen.getAllByRole("checkbox", { name: /buy milk/i })[0] as HTMLElement;
      expect(row).toBeChecked();
    });
  });
});
