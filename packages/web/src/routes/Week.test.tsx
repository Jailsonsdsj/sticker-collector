import type { Task } from "@sticker-collector/shared";
import {
  maskFromDays,
  WEEKDAYS_MASK_ALL,
  WEEKDAYS_MASK_WEEKDAYS,
  type Weekday,
  weekdayOf,
} from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionQueueProvider } from "../lib/completionQueue";
import { today } from "../lib/timezone";
import { Week } from "./Week";

/**
 * The two views are separate because one gesture cannot mean both "run this
 * routine on Tuesdays" and "I did it on Tuesday". These tests care that the
 * switch is real and that Schedule stays the default — T-12's five taps depend
 * on it.
 */

const ROUTINES: Task[] = [
  {
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
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
  },
  {
    id: "t2",
    epicId: null,
    title: "Buy milk",
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
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
let onCommit: ReturnType<
  typeof vi.fn<(ref: { taskId: string; scheduledOn: string }) => Promise<unknown>>
>;
let queryClient: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/week"]}>
        <CompletionQueueProvider onCommit={onCommit}>{children}</CompletionQueueProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  onCommit = vi.fn().mockResolvedValue(undefined);
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const read = (init?.method ?? "GET") === "GET";
    if (read && url.startsWith("/api/tasks")) return json(ROUTINES);
    if (read && url.startsWith("/api/occurrences")) return json([]);
    if (read && url.startsWith("/api/epics")) return json([]);
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const renderScreen = () => render(<Week />, { wrapper });
const scheduleCell = (day: string) => screen.getByRole("checkbox", { name: `Stretch — ${day}` });

describe("the two views", () => {
  it('opens on Agenda — "what am I meant to be doing now" is the question this tab is opened with', async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Agenda" })).toHaveAttribute("aria-selected", "true"),
    );
    // Only one grid is mounted at a time, so Schedule's help text is not merely
    // hidden — it is not there until you switch.
    expect(screen.queryByText(/add or remove that weekday/i)).not.toBeInTheDocument();
  });

  it("switches to Tick off, and only one grid is on screen at a time", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("tab", { name: "Agenda" });

    await user.click(screen.getByRole("tab", { name: "Tick off" }));

    expect(screen.getByText(/tap a cell to complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/add or remove that weekday/i)).not.toBeInTheDocument();
  });

  it("lists only routines — a one-off has no weekly schedule", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("tab", { name: "Tick off" }));

    await waitFor(() => expect(screen.getByText("Stretch")).toBeInTheDocument());
    expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
  });
});

describe("Schedule still edits the mask", () => {
  it("patches the task when a cell is tapped", async () => {
    const user = userEvent.setup();
    renderScreen();

    // Agenda is the default view now; scheduling lives two tabs across.
    await user.click(await screen.findByRole("tab", { name: "Schedule" }));
    await waitFor(() => expect(scheduleCell("Sat")).toBeInTheDocument());

    await user.click(scheduleCell("Sat"));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patch?.[0]).toBe("/api/tasks/t1");
      expect(JSON.parse(patch?.[1].body as string)).toEqual({
        weekdays: maskFromDays([0, 1, 2, 3, 4, 5] as Weekday[]),
      });
    });
  });
});

describe("Tick off goes through the undo queue", () => {
  it("issues no request when a cell is ticked — it waits out the window", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("tab", { name: "Agenda" });
    await user.click(screen.getByRole("tab", { name: "Tick off" }));
    await screen.findByRole("checkbox", { name: "Stretch — Mon" });

    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("checkbox", { name: "Stretch — Mon" }));

    // Same rule as the home screen: a misclick must not silently pay coins.
    expect(onCommit).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(screen.getByRole("checkbox", { name: "Stretch — Mon" })).toBeChecked();
  });

  it("untick inside the window cancels rather than re-opening", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("tab", { name: "Agenda" });
    await user.click(screen.getByRole("tab", { name: "Tick off" }));

    const cell = () => screen.getByRole("checkbox", { name: "Stretch — Mon" });
    await screen.findByRole("checkbox", { name: "Stretch — Mon" });
    await user.click(cell());
    await user.click(cell());

    expect(cell()).not.toBeChecked();
    expect(onCommit).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("uncomplete"))).toBe(false);
  });
});

describe("opening a block on the agenda", () => {
  // A routine with a time, because the agenda shows nothing else — and the
  // day is derived from the app's own clock, not UTC, so the fixture and the
  // screen cannot disagree about which day "today" is (TD-39's class).
  const timed = (): Task[] => [
    {
      ...(ROUTINES[0] as Task),
      id: "t1",
      title: "Stretch",
      weekdays: WEEKDAYS_MASK_ALL,
      slots: [{ weekday: weekdayOf(today()), startMin: 600, endMin: 660 }],
    },
  ];

  const openBlock = async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/tasks")) return json(timed());
      if (read && url.startsWith("/api/occurrences")) return json([]);
      if (read && url.startsWith("/api/epics")) return json([]);
      return json({ ok: true });
    });
    const user = userEvent.setup();
    render(<Week />, { wrapper });
    const block = await screen.findByRole("button", { name: /^Stretch, 10:00–11:00/ });
    await user.click(block);
    return user;
  };

  it("reads the task rather than ticking it", async () => {
    // Tapping to complete made the commonest gesture on the screen the
    // destructive one, and left no way to reach the task's own words.
    await openBlock();

    expect(screen.getByRole("heading", { name: "Stretch" })).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("offers the whole set of actions, which is the point of the change", async () => {
    await openBlock();

    for (const name of ["Done", "Start", "Edit"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("completes for the day the block sits on, through the undo queue", async () => {
    const user = await openBlock();

    await user.click(screen.getByRole("button", { name: "Done" }));

    // Deferred, like everywhere else — nothing is sent until the window closes.
    expect(onCommit).not.toHaveBeenCalled();
    await waitFor(
      () => expect(onCommit).toHaveBeenCalledWith({ taskId: "t1", scheduledOn: today() }),
      { timeout: 5000 },
    );
  });

  it("withholds Done on a day that has not arrived, but still opens it", async () => {
    // T-05 refuses a completion before its day, so the sheet offers everything
    // except the one action the API would 400. W8-05 is where that changes.
    const ahead = (): Task[] => [
      {
        ...(ROUTINES[0] as Task),
        id: "t1",
        title: "Stretch",
        weekdays: WEEKDAYS_MASK_ALL,
        // Tomorrow, wrapping to Monday when today is Sunday.
        slots: [{ weekday: ((weekdayOf(today()) + 1) % 7) as Weekday, startMin: 600, endMin: 660 }],
      },
    ];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const read = (init?.method ?? "GET") === "GET";
      if (read && url.startsWith("/api/tasks")) return json(ahead());
      if (read && url.startsWith("/api/occurrences")) return json([]);
      if (read && url.startsWith("/api/epics")) return json([]);
      return json({ ok: true });
    });
    // The wide layout, because the phone one shows the selected day only and
    // the block under test is on another one. jsdom answers no to every media
    // query unless told otherwise.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));
    const user = userEvent.setup();
    render(<Week />, { wrapper });

    const block = await screen.findByRole("button", { name: /^Stretch, 10:00–11:00/ });
    await user.click(block);

    expect(screen.getByRole("heading", { name: "Stretch" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    // Nor Start: *In progress* takes a routine through today's occurrence
    // alone, so starting tomorrow's block would move nothing.
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("deletes the task the block belongs to, after asking", async () => {
    const user = await openBlock();

    await user.click(screen.getByRole("button", { name: /delete task/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === "/api/tasks/t1" && init?.method === "DELETE",
        ),
      ).toBe(true),
    );
  });

  it("hands over to the editor, one sheet at a time", async () => {
    const user = await openBlock();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
    expect(screen.getByDisplayValue("Stretch")).toBeInTheDocument();
  });
});
