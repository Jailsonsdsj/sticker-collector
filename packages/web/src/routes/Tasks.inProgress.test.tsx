import type { Occurrence, Task } from "@sticker-collector/shared";
import { addDays } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionQueueProvider } from "../lib/completionQueue";
import { today } from "../lib/timezone";
import { Tasks } from "./Tasks";

/**
 * Reported from the device: a routine started yesterday came up "in progress"
 * again this morning instead of in *For today*.
 *
 * `lib/home.test.ts` covers the rule. This covers the wiring — that the screen
 * and the Start/Stop button both ask it, rather than reading the raw
 * `startedAt` flag, which is how the two would come to disagree.
 */
const TODAY = today();
const YESTERDAY = addDays(TODAY, -1);

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
  weekdays: 0b1111111,
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
});

const occurrence = (): Occurrence => ({
  taskId: "t1",
  scheduledOn: TODAY,
  status: "pending",
  completedAt: null,
  rewardSnapshotCoins: null,
});

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;
let tasks: Task[];

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
    if (read && url.startsWith("/api/occurrences")) return json([occurrence()]);
    if (read && url.startsWith("/api/tasks")) return json(tasks);
    if (read && url.startsWith("/api/epics")) return json([]);
    if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

/** The name of the section a row is sitting in — which is the whole question. */
const sectionOf = (title: string) => {
  const section = screen.getByText(title).closest("section");
  return section?.querySelector("button[aria-expanded]")?.textContent ?? "(no section)";
};

const openDetail = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.click(screen.getByText(title));
  return within(document.querySelector("dialog[open]") as HTMLElement);
};

describe("a routine started yesterday", () => {
  it("comes back to For today rather than staying In progress", async () => {
    tasks = [task({ startedAt: `${YESTERDAY}T09:00:00Z` })];
    render(<Tasks />, { wrapper });

    await waitFor(() => expect(screen.getByText("Stretch")).toBeInTheDocument());

    expect(sectionOf("Stretch")).toMatch(/For today/i);
    expect(sectionOf("Stretch")).not.toMatch(/In progress/i);
  });

  it("offers Start, not Stop — the button has to agree with the list", async () => {
    // The half a wiring mistake would break silently: the list derives, the
    // button reads `startedAt`, and the same routine is in For today while
    // being offered a Stop.
    const user = userEvent.setup();
    tasks = [task({ startedAt: `${YESTERDAY}T09:00:00Z` })];
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getByText("Stretch")).toBeInTheDocument());

    const detail = await openDetail(user, "Stretch");

    expect(detail.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(detail.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });
});

describe("a routine started today", () => {
  it("is In progress, and the button offers to stop it", async () => {
    const user = userEvent.setup();
    tasks = [task({ startedAt: `${TODAY}T09:00:00Z` })];
    render(<Tasks />, { wrapper });
    await waitFor(() => expect(screen.getByText("Stretch")).toBeInTheDocument());

    expect(sectionOf("Stretch")).toMatch(/In progress/i);

    const detail = await openDetail(user, "Stretch");
    expect(detail.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });
});
