import type { Task } from "@sticker-collector/shared";
import { maskFromDays, WEEKDAYS_MASK_WEEKDAYS, type Weekday } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionQueueProvider } from "../lib/completionQueue";
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
  it("opens on Complete — ticking a day is the daily act, re-planning is not", async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Complete" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    // Only one grid is mounted at a time, so Schedule's help text is not merely
    // hidden — it is not there until you switch.
    expect(screen.queryByText(/add or remove that weekday/i)).not.toBeInTheDocument();
  });

  it("switches to Complete, and only one grid is on screen at a time", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(scheduleCell("Mon")).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Complete" }));

    expect(screen.getByText(/tap a cell to complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/add or remove that weekday/i)).not.toBeInTheDocument();
  });

  it("lists only routines — a one-off has no weekly schedule", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Stretch")).toBeInTheDocument());
    expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
  });
});

describe("Schedule still edits the mask", () => {
  it("patches the task when a cell is tapped", async () => {
    const user = userEvent.setup();
    renderScreen();

    // Complete is the default view now; scheduling lives one tab across.
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

describe("Complete goes through the undo queue", () => {
  it("issues no request when a cell is ticked — it waits out the window", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(scheduleCell("Mon")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Complete" }));

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
    await waitFor(() => expect(scheduleCell("Mon")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Complete" }));

    const cell = () => screen.getByRole("checkbox", { name: "Stretch — Mon" });
    await user.click(cell());
    await user.click(cell());

    expect(cell()).not.toBeChecked();
    expect(onCommit).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("uncomplete"))).toBe(false);
  });
});
