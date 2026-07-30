import type { EffortReport, MomentumReport } from "@sticker-collector/shared";
import { addDays } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reports } from "./Reports";

const TODAY = "2026-07-29"; // a Wednesday
const MONDAY = "2026-07-27";

function momentum(over: Partial<MomentumReport> = {}): MomentumReport {
  return {
    today: TODAY,
    streaks: [
      { taskId: "t1", title: "Stretch", current: 5, longest: 12, lastCompletedOn: TODAY },
      { taskId: "t2", title: "Read", current: 0, longest: 3, lastCompletedOn: MONDAY },
    ],
    perfect: { count: 9, current: 2 },
    rates: [
      { days: 7, scheduled: 10, done: 8, percent: 80 },
      { days: 30, scheduled: 40, done: 20, percent: 50 },
      { days: 90, scheduled: 0, done: 0, percent: null },
    ],
    weekdays: [
      { weekday: 0, label: "Mon", scheduled: 4, done: 4, percent: 100 },
      { weekday: 1, label: "Tue", scheduled: 4, done: 2, percent: 50 },
      { weekday: 2, label: "Wed", scheduled: 4, done: 1, percent: 25 },
      { weekday: 3, label: "Thu", scheduled: 4, done: 0, percent: 0 },
      { weekday: 4, label: "Fri", scheduled: 4, done: 0, percent: 0 },
      { weekday: 5, label: "Sat", scheduled: 0, done: 0, percent: null },
      { weekday: 6, label: "Sun", scheduled: 0, done: 0, percent: null },
    ],
    days: Array.from({ length: 30 }, (_, i) => ({
      date: addDays(TODAY, i - 29),
      scheduled: 1,
      done: i % 2 === 0 ? 1 : 0,
    })),
    ...over,
  };
}

function effort(over: Partial<EffortReport> = {}): EffortReport {
  return {
    today: TODAY,
    weeks: [
      { key: MONDAY, minutes: 120, coins: 120 },
      { key: addDays(MONDAY, -7), minutes: 45, coins: 45 },
    ],
    months: [{ key: "2026-07", minutes: 165, coins: 165 }],
    epics: [
      { epicId: "e1", minutes: 120 },
      { epicId: null, minutes: 45 },
    ],
    collection: [
      { date: addDays(TODAY, -1), stickers: 3 },
      { date: TODAY, stickers: 5 },
    ],
    albumsCompleted: 2,
    shelf: [
      {
        albumId: "a1",
        title: "Kitchen heroes",
        coverKey: `img/${"a".repeat(64)}.jpg`,
        completedOn: TODAY,
      },
    ],
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;
let momentumBody: MomentumReport;
let effortBody: EffortReport;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/reports"]}>
        <Routes>
          <Route path="/reports" element={children} />
          <Route path="/login" element={<p>the login screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  momentumBody = momentum();
  effortBody = effort();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.startsWith("/api/reports/momentum")) return json(momentumBody);
    if (url.startsWith("/api/reports/effort")) return json(effortBody);
    if (url.startsWith("/api/epics")) {
      return json([
        {
          id: "e1",
          title: "Health",
          accent: "epic-1",
          description: null,
          createdAt: "2026-07-01T00:00:00Z",
          oneOffTotal: 0,
          oneOffDone: 0,
        },
      ]);
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const open = async () => {
  render(<Reports />, { wrapper });
  await screen.findByRole("heading", { name: "Consistency" });
};

describe("nothing economic on screen", () => {
  it("never asks for the wallet", async () => {
    // A balance is the most natural thing to reach for on a stats screen, and
    // its absence is the clearest signal the momentum framing held.
    await open();

    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls.some((url) => url.startsWith("/api/wallet"))).toBe(false);
  });

  it("shows no balance, price or spend anywhere", async () => {
    // Coin-allocation breakdowns, album ROI and pull luck are out of scope.
    await open();

    const text = document.body.textContent ?? "";
    for (const word of ["Balance", "balance", "Spent", "spend", "Unlock", "price"]) {
      expect(text, word).not.toContain(word);
    }
  });

  it("still shows minutes, because a coin is a minute", async () => {
    await open();
    expect(screen.getByText(/the same number as coins earned/)).toBeInTheDocument();
  });
});

describe("what it assembles", () => {
  it("shows each streak with its current run and its best", async () => {
    await open();

    expect(screen.getByText("Stretch")).toBeInTheDocument();
    expect(screen.getByText("5 days")).toBeInTheDocument();
    expect(screen.getByText("best 12")).toBeInTheDocument();
  });

  it("shows perfect days as a count and a run", async () => {
    await open();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText(/2 in a row/)).toBeInTheDocument();
  });

  it("shows all three trailing windows", async () => {
    await open();
    expect(screen.getByText("7 days")).toBeInTheDocument();
    expect(screen.getByText("30 days")).toBeInTheDocument();
    expect(screen.getByText("90 days")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("shows a dash, not 0%, for a window with nothing scheduled", async () => {
    // The API sends null for exactly this reason; printing 0% would throw the
    // distinction away at the last step. Scoped to the card — the weekday bars
    // also render dashes, so a bare search for one proves nothing.
    await open();

    const card = screen.getByText("90 days").closest("div") as HTMLElement;
    expect(within(card).getByText("—")).toBeInTheDocument();
    expect(card.textContent).not.toContain("0%");

    // And the same distinction reaches assistive tech.
    expect(screen.getByLabelText("90-day completion: nothing scheduled")).toBeInTheDocument();
  });

  it("keeps the weekday shape Monday-first", async () => {
    await open();
    const rows = [...document.querySelectorAll("[data-weekday]")];
    expect(rows.map((row) => (row as HTMLElement).dataset.weekday)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(rows[0]?.textContent).toContain("Mon");
  });

  it("draws the heatmap", async () => {
    await open();
    expect(screen.getByLabelText("Completion heatmap")).toBeInTheDocument();
  });

  it("names the epics the time went to, and labels unassigned work", async () => {
    await open();
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("No epic")).toBeInTheDocument();
  });

  it("shows the collection and the shelf", async () => {
    await open();
    expect(screen.getByText("5")).toBeInTheDocument(); // stickers owned
    expect(screen.getByText("2")).toBeInTheDocument(); // albums finished
    expect(screen.getByAltText("Kitchen heroes")).toBeInTheDocument();
  });
});

describe("a user with no history", () => {
  it("gets an invitation rather than seven zeros", async () => {
    momentumBody = momentum({
      streaks: [],
      perfect: { count: 0, current: 0 },
      days: Array.from({ length: 30 }, (_, i) => ({
        date: addDays(TODAY, i - 29),
        scheduled: 0,
        done: 0,
      })),
    });
    effortBody = effort({
      weeks: [],
      months: [],
      epics: [],
      collection: [],
      albumsCompleted: 0,
      shelf: [],
    });

    render(<Reports />, { wrapper });

    expect(await screen.findByText("Nothing to report yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Consistency" })).not.toBeInTheDocument();
  });
});

describe("an expired session", () => {
  it("goes to the login screen", async () => {
    fetchMock.mockImplementation(async () => json({ error: "unauthorized" }, 401));
    render(<Reports />, { wrapper });

    await waitFor(() => expect(screen.getByText("the login screen")).toBeInTheDocument());
  });
});
