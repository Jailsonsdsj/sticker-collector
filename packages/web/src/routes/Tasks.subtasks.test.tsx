import type { Occurrence, Subtask, Task } from "@sticker-collector/shared";
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
 * Ticking a step from the task sheet.
 *
 * The ordering rule is `shared/subtasks.test.ts` and the list is
 * `SubtaskList.test.tsx`. What is here is the wiring, and one bug it had: the
 * sheet rendered the task as it was when it opened, so a tick changed the cache
 * and nothing on screen until it was closed and reopened.
 */
const TODAY = today();

const step = (over: Partial<Subtask> = {}): Subtask => ({
  id: "s1",
  title: "Fill the can",
  position: 0,
  doneOn: null,
  ...over,
});

const task = (over: Partial<Task>): Task => ({
  id: "t1",
  epicId: null,
  title: "Water the plants",
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
  subtasks: [],
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
  tasks = [
    task({
      subtasks: [
        step({ id: "a", title: "Fill the can", position: 0 }),
        step({ id: "b", title: "Water the herbs", position: 1 }),
      ],
    }),
  ];
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const read = (init?.method ?? "GET") === "GET";
    if (read && url.startsWith("/api/occurrences")) return json([occurrence()]);
    if (read && url.startsWith("/api/tasks")) return json(tasks);
    if (read && url.startsWith("/api/epics")) return json([]);
    if (read && url.startsWith("/api/wallet")) return json({ balance: 0 });
    // The toggle WRITES, so the mock has to write. Answering the refetch with
    // the unchanged list would overwrite the optimistic tick a moment after it
    // appeared — which is a fake failure, not a real one.
    const step = /\/api\/tasks\/([^/]+)\/subtasks\/([^/]+)$/.exec(url);
    if (step) {
      const { done } = JSON.parse(init?.body as string) as { done: boolean };
      tasks = tasks.map((row) =>
        row.id === step[1]
          ? {
              ...row,
              subtasks: row.subtasks.map((s) =>
                s.id === step[2] ? { ...s, doneOn: done ? TODAY : null } : s,
              ),
            }
          : row,
      );
      return json({ subtasks: tasks.find((r) => r.id === step[1])?.subtasks ?? [] });
    }
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const openSheet = async () => {
  const user = userEvent.setup();
  render(<Tasks />, { wrapper });
  await waitFor(() => expect(screen.getByText("Water the plants")).toBeInTheDocument());
  await user.click(screen.getByText("Water the plants"));
  const sheet = within(document.querySelector("dialog[open]") as HTMLElement);
  return { user, sheet };
};

describe("ticking a step from the sheet", () => {
  it("shows the steps a task carries", async () => {
    const { sheet } = await openSheet();

    expect(sheet.getByText("Fill the can")).toBeInTheDocument();
    expect(sheet.getByText("Water the herbs")).toBeInTheDocument();
    expect(sheet.getByText("0/2")).toBeInTheDocument();
  });

  it("sends the tick to the step's own endpoint", async () => {
    const { user, sheet } = await openSheet();

    await user.click(sheet.getByText("Fill the can"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/t1/subtasks/a",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });

  it("ticks it on screen without waiting to be reopened", async () => {
    // The bug: the sheet rendered the task as it was when it opened, so the
    // cache changed and the checkbox did not. It looked like nothing happened.
    const { user, sheet } = await openSheet();

    await user.click(sheet.getByText("Fill the can"));

    await waitFor(() => expect(sheet.getByText("1/2")).toBeInTheDocument());
  });

  it("moves the ticked one to the bottom, still without reopening", async () => {
    const { user, sheet } = await openSheet();
    const titles = () =>
      sheet.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"));
    expect(titles()).toEqual(["Fill the can", "Water the herbs"]);

    await user.click(sheet.getByText("Fill the can"));

    await waitFor(() => expect(titles()).toEqual(["Water the herbs", "Fill the can"]));
  });

  it("unticks one that was already done", async () => {
    tasks = [task({ subtasks: [step({ id: "a", doneOn: TODAY })] })];
    const { user, sheet } = await openSheet();
    expect(sheet.getByText("1/1")).toBeInTheDocument();

    await user.click(sheet.getByText("Fill the can"));

    await waitFor(() => expect(sheet.getByText("0/1")).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/subtasks/"));
    expect(call).toBeDefined();
    expect(JSON.parse((call?.[1] as RequestInit)?.body as string)).toEqual({ done: false });
  });

  it("shows no steps section for a task without any", async () => {
    tasks = [task({ subtasks: [] })];
    const { sheet } = await openSheet();

    expect(sheet.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });
});
