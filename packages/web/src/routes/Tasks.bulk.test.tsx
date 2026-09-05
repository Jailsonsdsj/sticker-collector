import type { Occurrence, Task } from "@sticker-collector/shared";
import { addDays, WEEKDAYS_MASK_WEEKDAYS } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionQueueProvider } from "../lib/completionQueue";
import { today } from "../lib/timezone";
import { Tasks } from "./Tasks";

/**
 * Multi-select on the home screen.
 *
 * The rows are occurrences and the API takes task ids, so the interesting
 * assertions are about that gap: one routine spans several rows, and picking
 * any of them must mark all of them and send its id exactly once.
 */

/**
 * The app's own today, not UTC's.
 *
 * The screen resolves the local day through `lib/timezone`, so a fixture dated
 * in UTC disagrees with it for the hours the two differ — west of UTC, every
 * evening. Every occurrence dated "today" then landed in the routine backlog
 * and *For today* rendered empty, which failed four tests after 21:00 local and
 * passed again by morning.
 */
const TODAY = today();

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
  startedAt: null,
  slots: [],
  subtasks: [],
  blockUntilSteps: false,
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
//
// Today and the two days AHEAD. Days that have gone are no longer on this
// screen — they belong to the Week tab — so a fixture built from them would
// render one row and prove nothing about selecting by task.
const OCCURRENCES: Occurrence[] = [0, 1, 2].map((offset) => ({
  taskId: "t1",
  scheduledOn: addDays(TODAY, offset),
  status: "pending",
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

  // The routine backlog starts folded — it is a fortnight that has not happened
  // — and these tests are about a routine spanning several days, which is what
  // that section holds now that days already gone live on the Week tab.
  const backlog = screen.queryByRole("button", { name: /Routine backlog/ });
  if (backlog && backlog.getAttribute("aria-expanded") === "false") await user.click(backlog);

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

  it("restores the search, the New task button and completion", async () => {
    const user = await enterSelection();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("searchbox", { name: /search tasks/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New task/ })).toBeInTheDocument();
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

  it("starts the task from the view and gets out of the way", async () => {
    // The point of the button is the row moving to another section, and that
    // section is behind the sheet.
    const user = await openScreen();
    await user.click(screen.getAllByRole("button", { name: "Buy milk" })[0] as HTMLElement);

    await user.click(dialog().getByRole("button", { name: "Start" }));

    expect(document.querySelector("dialog[open]")).toBeNull();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.find(
          ([url, init]) => url === "/api/tasks/t2" && init?.method === "PATCH",
        ),
      ).toBeTruthy(),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([url, i]) => url === "/api/tasks/t2" && i?.method === "PATCH",
    ) as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ startedAt: expect.any(String) });
  });

  it("stops it again without pinning it, unlike the swipe", async () => {
    // The left swipe means "bring it back to today" and pins an undated
    // capture. This button only means stop.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/occurrences")) return json(OCCURRENCES);
      if (read && url.startsWith("/api/tasks"))
        return json([
          task({
            id: "t2",
            title: "Buy milk",
            type: "oneoff",
            weekdays: null,
            startedAt: "2026-08-01T09:00:00Z",
          }),
        ]);
      if (read && url.startsWith("/api/epics")) return json([]);
      if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
      return json({ ok: true });
    });
    const user = userEvent.setup();
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("button", { name: "Buy milk" })[0] as HTMLElement);

    await user.click(dialog().getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, i]) => url === "/api/tasks/t2" && i?.method === "PATCH",
      );
      expect(call && JSON.parse(call[1].body as string)).toEqual({ startedAt: null });
    });
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

describe("which date a tick is sent for", () => {
  it("closes an undated one-off on TODAY, even after it was ticked and untangled before", async () => {
    // Unticking leaves the occurrence row behind as `pending`, so an undated
    // one-off can carry yesterday's date around forever. Sending that back is
    // the reported bug: "an undated task can only be completed today" on a task
    // that looks perfectly ordinary.
    const stale = addDays(TODAY, -3);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/occurrences"))
        return json([
          {
            taskId: "t2",
            scheduledOn: stale,
            status: "pending",
            completedAt: null,
            rewardSnapshotCoins: null,
          },
        ]);
      if (read && url.startsWith("/api/tasks")) return json(TASKS);
      if (read && url.startsWith("/api/epics")) return json([]);
      if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
      return json({ ok: true });
    });

    // Asserted at the queue's own boundary rather than on the wire: the write
    // is deferred by the undo window, and what matters here is the reference
    // the row hands over.
    const onCommit = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <CompletionQueueProvider onCommit={onCommit}>
            <Tasks />
          </CompletionQueueProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));

    await user.click(screen.getAllByRole("checkbox", { name: /buy milk/i })[0] as HTMLElement);

    // The app's own today, not this file's UTC one: the point is that the
    // stale row's date is not what gets sent.
    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith({ taskId: "t2", scheduledOn: today() }),
    );
    expect(onCommit).not.toHaveBeenCalledWith({ taskId: "t2", scheduledOn: stale });
  }, 10000);

  it("keeps the occurrence's own date for a DATED one-off", async () => {
    // The exception is undated one-offs only. A dated one is scheduled on its
    // due date and nothing else, so forcing today would send a date the API
    // refuses with "the task is not scheduled on that date".
    // Relative to the app's own today, not this file's UTC one: on a machine
    // west of UTC those differ by a day, and the test would pass by accident.
    const due = addDays(today(), -1);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/occurrences"))
        return json([
          {
            taskId: "t3",
            scheduledOn: due,
            status: "missed",
            completedAt: null,
            rewardSnapshotCoins: null,
          },
        ]);
      if (read && url.startsWith("/api/tasks"))
        return json([
          task({
            id: "t3",
            title: "Post the form",
            type: "oneoff",
            weekdays: null,
            dueAt: `${due}T09:00:00Z`,
          }),
        ]);
      if (read && url.startsWith("/api/epics")) return json([]);
      if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
      return json({ ok: true });
    });

    const onCommit = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/"]}>
          <CompletionQueueProvider onCommit={onCommit}>
            <Tasks />
          </CompletionQueueProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // An overdue capture lives under Missed now, which starts folded.
    await user.click(await screen.findByRole("button", { name: /Missed/ }));
    await waitFor(() => expect(screen.getAllByText("Post the form").length).toBeGreaterThan(0));

    await user.click(screen.getAllByRole("checkbox", { name: /post the form/i })[0] as HTMLElement);

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith({ taskId: "t3", scheduledOn: due }));
  }, 10000);
});

describe("yesterday, read back on the first visit of the day", () => {
  const yesterday = addDays(TODAY, -1);

  const withYesterday = () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/occurrences"))
        return json([
          {
            taskId: "t2",
            scheduledOn: yesterday,
            status: "done",
            completedAt: `${yesterday}T12:00:00Z`,
            rewardSnapshotCoins: 30,
          },
        ]);
      if (read && url.startsWith("/api/tasks")) return json(TASKS);
      if (read && url.startsWith("/api/epics")) return json([]);
      if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
      return json({ ok: true });
    });
  };

  it("opens once, listing what was finished and what it paid", async () => {
    withYesterday();
    render(<Tasks />, { wrapper });

    expect(await screen.findByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText(/One thing finished/)).toBeInTheDocument();
    expect(screen.getByText("+30")).toBeInTheDocument();
  });

  it("does not open again the same day", async () => {
    withYesterday();
    const first = render(<Tasks />, { wrapper });
    await screen.findByText("Yesterday");
    first.unmount();

    render(<Tasks />, { wrapper });

    // The wallet is on the screen whatever the sections contain — this fixture
    // has one done occurrence and nothing else to render.
    await screen.findByRole("region", { name: "Wallet" });
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
  });

  it("stays away when yesterday was empty", async () => {
    // The default fixture has no completions at all.
    render(<Tasks />, { wrapper });

    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
  });
});

describe("swiping a row between the two lists", () => {
  const swipe = (row: HTMLElement, dx: number) => {
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 0, clientY: 0 });
    fireEvent.pointerMove(row, { pointerType: "touch", clientX: dx, clientY: 0 });
    fireEvent.pointerUp(row, { pointerType: "touch", clientX: dx, clientY: 0 });
  };

  const rowFor = (title: string) =>
    (screen.getAllByText(title)[0] as HTMLElement).closest("[class*='touch-pan-y']") as HTMLElement;

  const patchFor = (id: string) => {
    const call = fetchMock.mock.calls.find(
      ([url, init]) => url === `/api/tasks/${id}` && init?.method === "PATCH",
    );
    return call ? JSON.parse(call[1].body as string) : null;
  };

  const open = async () => {
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));
  };

  it("starts the task on a swipe right", async () => {
    await open();

    swipe(rowFor("Buy milk"), 120);

    await waitFor(() => expect(patchFor("t2")?.startedAt).toEqual(expect.any(String)));
  });

  it("brings it back to today on a swipe left, and stops it", async () => {
    // A task cannot be both "in progress" and "waiting for today", and the
    // opposite swipe is how each is undone.
    await open();

    swipe(rowFor("Buy milk"), -120);

    await waitFor(() =>
      expect(patchFor("t2")).toEqual({ startedAt: null, pinnedOn: expect.any(String) }),
    );
  });

  it("never deletes anything", async () => {
    // Delete used to live on the left. It moved to the task view, where it
    // still asks first.
    await open();

    swipe(rowFor("Buy milk"), -120);
    swipe(rowFor("Buy milk"), 120);

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("stops a started routine without trying to pin it", async () => {
    // Only an undated one-off can be pinned; sending a pin for a routine would
    // have the API refuse the whole gesture, stopping included.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/occurrences")) return json(OCCURRENCES);
      if (read && url.startsWith("/api/tasks"))
        return json([task({ id: "t1", startedAt: "2026-08-01T09:00:00Z", weekdays: 0b1111111 })]);
      if (read && url.startsWith("/api/epics")) return json([]);
      if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
      return json({ ok: true });
    });
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getAllByText("Stretch").length).toBeGreaterThan(0));

    swipe(rowFor("Stretch"), -120);

    await waitFor(() => expect(patchFor("t1")).toEqual({ startedAt: null }));
  });

  it("says why instead, for a routine that was never started", async () => {
    // Nothing to stop and nothing to pin: the gesture would do nothing at all,
    // which reads as broken.
    await open();

    swipe(rowFor("Stretch"), -120);

    expect(await screen.findByRole("status")).toHaveTextContent(/routines follow their own/i);
    expect(patchFor("t1")).toBeNull();
  });
});

describe("the way in", () => {
  it("offers one door, called New task", async () => {
    // The one-line quick-add above it created an undated one-off with a default
    // effort — the same thing this form produces, with a section and a priority
    // the capture box could not ask for. Two doors to one room, and the smaller
    // one could not say where the task landed.
    const user = userEvent.setup();
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));

    expect(screen.queryByRole("textbox", { name: /quick-add/i })).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: /New task/ });
    expect(button).toHaveTextContent(/^＋ New task$/);

    await user.click(button);
    expect(document.querySelector("dialog[open]")).not.toBeNull();
  });
});

describe("searching the list", () => {
  const open = async () => {
    const user = userEvent.setup();
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));
    return user;
  };

  const field = () => screen.getByRole("searchbox", { name: /search tasks/i });

  it("narrows the list as it is typed, with nothing to submit", async () => {
    const user = await open();

    await user.type(field(), "milk");

    // No Enter, no button: the list has already narrowed.
    expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0);
    expect(screen.queryByText("Stretch")).not.toBeInTheDocument();
  });

  it("sits above the New task button", async () => {
    // This screen is read far more often than it is added to.
    await open();

    const position = field().compareDocumentPosition(
      screen.getByRole("button", { name: /New task/ }),
    );
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the folded sections, so a match cannot hide in one", async () => {
    // A routine scheduled only on days AHEAD lives in the routine backlog,
    // which starts folded. A search that skipped it would report "no matches"
    // for a task that is right there.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/occurrences"))
        return json([
          {
            taskId: "t1",
            scheduledOn: addDays(TODAY, 2),
            status: "pending",
            completedAt: null,
            rewardSnapshotCoins: null,
          },
        ]);
      if (read && url.startsWith("/api/tasks")) return json(TASKS);
      if (read && url.startsWith("/api/epics")) return json([]);
      if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
      return json({ ok: true });
    });
    const user = userEvent.setup();
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0));

    // Folded to begin with.
    expect(screen.queryByText("Stretch")).not.toBeInTheDocument();

    await user.type(field(), "stretch");

    expect(screen.getAllByText("Stretch").length).toBeGreaterThan(0);
  });

  it("says so when nothing matches, and offers the way back", async () => {
    const user = await open();

    await user.type(field(), "xylophone");

    expect(screen.getByText("No task matches that")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /clear the search/i }));
    expect(screen.getAllByText("Buy milk").length).toBeGreaterThan(0);
  });

  it("clears from the field's own button", async () => {
    const user = await open();
    await user.type(field(), "milk");

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(field()).toHaveValue("");
    expect(screen.getAllByText("Stretch").length).toBeGreaterThan(0);
  });

  it("offers no Clear until there is something to clear", async () => {
    await open();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
