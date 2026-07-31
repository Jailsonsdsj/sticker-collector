import type { Epic, Task } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Epics } from "./Epics";

/**
 * The done-when: "add-task from an epic pre-fills". Asserted through the real
 * screen and the real form — a unit test of `TaskForm`'s prop would not catch
 * the screen forgetting to pass it, which is the way this actually breaks.
 */

const EPICS: Epic[] = [
  {
    id: "e1",
    title: "Sticker App",
    accent: "epic-1",
    coinGoalAlbumId: null,
    createdAt: "2026-07-01T00:00:00Z",
    oneOffTotal: 2,
    oneOffDone: 1,
  },
  {
    id: "e2",
    title: "Health",
    accent: "epic-2",
    coinGoalAlbumId: null,
    createdAt: "2026-07-01T00:00:00Z",
    oneOffTotal: 0,
    oneOffDone: 0,
  },
];

const TASKS: Task[] = [
  {
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
  },
  { ...({} as Task), id: "t2", epicId: "e2", title: "Stretch", type: "routine" } as Task,
];

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/epics"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    // `api()` always sets a method, so matching on `undefined` would send every
    // request down the mutation branch and hand the screen an object where it
    // expects a list.
    const read = (init?.method ?? "GET") === "GET";
    if (read && url.startsWith("/api/epics")) return json(EPICS);
    if (read && url.startsWith("/api/tasks")) return json(TASKS);
    return json({ id: "new" }, 201);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const renderScreen = () => render(<Epics />, { wrapper });

/**
 * jsdom does not apply the UA stylesheet that hides a closed <dialog>, so every
 * sheet on the screen is queryable whether it is open or not — and both sheets
 * have a "Title" field. Scoping to `dialog[open]` matches what a person can
 * actually see and interact with.
 */
const sheet = () => within(document.querySelector("dialog[open]") as HTMLElement);

/** The card's own header button, not the epic chip of the same name inside the
 *  task form. The header is the one that reports expansion. */
const epicHeader = (title: string) =>
  screen
    .getAllByRole("button", { name: new RegExp(title, "i") })
    .find((b) => b.hasAttribute("aria-expanded")) as HTMLElement;

async function expandAndAdd(epicTitle: string) {
  const user = userEvent.setup();
  renderScreen();
  await waitFor(() => expect(epicHeader(epicTitle)).toBeInTheDocument());
  await user.click(epicHeader(epicTitle));
  await user.click(screen.getByRole("button", { name: /add task/i }));
  return user;
}

describe("the done-when — add-task from an epic pre-fills", () => {
  it("opens the shared form with that epic already chosen", async () => {
    await expandAndAdd("Sticker App");

    // The form is TaskForm itself, not a variant: same fields, same labels.
    expect(sheet().getByLabelText(/title/i)).toBeInTheDocument();
    expect(sheet().getByRole("button", { name: "Sticker App" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(sheet().getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "false");
  });

  it("submits that epic without the user touching the epic field", async () => {
    const user = await expandAndAdd("Sticker App");

    await user.type(sheet().getByLabelText(/title/i), "Write the docs");
    await user.type(sheet().getByLabelText(/^effort/i), "30");
    await user.click(sheet().getByRole("tab", { name: /one-off/i }));
    await user.click(sheet().getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/tasks" && init?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(JSON.parse(post?.[1].body as string)).toMatchObject({
        title: "Write the docs",
        epicId: "e1",
      });
    });
  });

  it("carries the second epic, not the first one opened", async () => {
    // The form seeds its state once on mount, so reopening from a different
    // epic only works because the screen remounts it.
    const user = await expandAndAdd("Sticker App");
    await user.click(sheet().getByRole("button", { name: "Cancel" }));

    await user.click(epicHeader("Health"));
    await user.click(screen.getByRole("button", { name: /add task/i }));

    expect(sheet().getByRole("button", { name: "Health" })).toHaveAttribute("aria-pressed", "true");
    expect(sheet().getByRole("button", { name: "Sticker App" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("the list", () => {
  it("shows every epic with its ratio", async () => {
    renderScreen();
    await waitFor(() => expect(epicHeader("Sticker App")).toBeInTheDocument());
    expect(epicHeader("Health")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows only that epic's tasks when expanded", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(epicHeader("Sticker App")).toBeInTheDocument());

    await user.click(epicHeader("Sticker App"));
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.queryByText("Stretch")).not.toBeInTheDocument();
  });
});

describe("epic CRUD", () => {
  it("creates one with a title and an accent token, never a colour", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(epicHeader("Sticker App")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /＋ new/i }));
    await user.type(sheet().getByLabelText(/title/i), "Travel");
    await user.click(sheet().getByRole("button", { name: "epic-3" }));
    await user.click(sheet().getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/epics" && init?.method === "POST",
      );
      expect(JSON.parse(post?.[1].body as string)).toEqual({ title: "Travel", accent: "epic-3" });
    });
  });

  it("renames one through the same sheet", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(epicHeader("Sticker App")).toBeInTheDocument());

    await user.click(epicHeader("Sticker App"));
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const title = sheet().getByLabelText(/title/i);
    expect(title).toHaveValue("Sticker App"); // arrives filled in
    await user.clear(title);
    await user.type(title, "Sticker Collector");
    await user.click(sheet().getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patch?.[0]).toBe("/api/epics/e1");
      expect(JSON.parse(patch?.[1].body as string)).toMatchObject({ title: "Sticker Collector" });
    });
  });

  it("asks what happens to the tasks, and sends the mode chosen", async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(epicHeader("Sticker App")).toBeInTheDocument());

    await user.click(epicHeader("Sticker App"));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    // Nothing is sent until the question is answered.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: /keep tasks/i }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(del?.[0]).toBe("/api/epics/e1?mode=unlink");
    });
  });
});
