import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionQueueProvider } from "../lib/completionQueue";
import { AlbumDetail } from "./AlbumDetail";
import { Albums } from "./Albums";
import { Epics } from "./Epics";
import { Reports } from "./Reports";
import { Tasks } from "./Tasks";
import { Week } from "./Week";

/**
 * One invariant, every screen: **a failed read is never an empty account.**
 *
 * Every screen builds its list with `data ?? []`, so before H-05 a dead network
 * or a 500 fell straight through to the empty state — the home screen said
 * "Nothing to do yet" to someone with a full day ahead, and the shelf said "No
 * albums yet" to someone with a finished collection. A blank screen reads as
 * broken; a confident empty state reads as *your data is gone*, which is why
 * this is tested as its own invariant rather than once per screen file.
 *
 * The exception proves the rule: an album really can be gone, so a 404 keeps
 * its own copy and only a 404 earns it.
 */

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

/** Every read fails; writes are irrelevant here. */
function failReads(respond: () => Promise<Response>) {
  fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") !== "GET") return json({ ok: true }, 201);
    return respond();
  });
  vi.stubGlobal("fetch", fetchMock);
}

const serverDown = () => failReads(async () => json({ error: "boom" }, 500));
const offline = () => failReads(() => Promise.reject(new TypeError("Failed to fetch")));

const alert = () => screen.findByRole("alert");

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("the home screen", () => {
  it("does not claim there is nothing to do when the read failed", async () => {
    serverDown();
    render(<Tasks />, { wrapper });

    expect(await alert()).toBeInTheDocument();
    expect(screen.queryByText("Nothing to do yet")).not.toBeInTheDocument();
  });

  it("reports a failure even when only the occurrences read broke", async () => {
    // The sections are built from both reads. Trusting the one that succeeded
    // would draw a day that is missing everything already completed.
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("/api/occurrences")) return json({ error: "boom" }, 500);
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Tasks />, { wrapper });

    expect(await alert()).toBeInTheDocument();
  });

  it("retries both reads at once, since either can be the broken one", async () => {
    serverDown();
    const user = userEvent.setup();
    render(<Tasks />, { wrapper });
    await alert();

    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    const retried = fetchMock.mock.calls.slice(before).map(([url]) => url as string);
    expect(retried.some((url) => url.startsWith("/api/occurrences"))).toBe(true);
    expect(retried.some((url) => url.startsWith("/api/tasks"))).toBe(true);
  });

  it("recovers to the real list when the retry succeeds", async () => {
    serverDown();
    const user = userEvent.setup();
    render(<Tasks />, { wrapper });
    await alert();

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/occurrences")) return json([]);
      return json([]);
    });
    await user.click(screen.getByRole("button", { name: "Try again" }));

    // Nothing came back, so now the empty state is the honest answer.
    await waitFor(() => expect(screen.getByText("Nothing to do yet")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the shelf", () => {
  it("does not claim the collection is empty when the read failed", async () => {
    serverDown();
    render(<Albums />, { wrapper });

    expect(await alert()).toBeInTheDocument();
    expect(screen.queryByText("No albums yet")).not.toBeInTheDocument();
  });

  it("says offline rather than failed when the request never left", async () => {
    // The likeliest failure for an installed PWA, and the one where "try
    // again" is the wrong advice on its own.
    offline();
    render(<Albums />, { wrapper });

    expect(await screen.findByRole("heading", { name: "No connection" })).toBeInTheDocument();
  });

  it("refetches the listing on retry", async () => {
    serverDown();
    const user = userEvent.setup();
    render(<Albums />, { wrapper });
    await alert();

    const before = fetchMock.mock.calls.filter(([url]) =>
      (url as string).startsWith("/api/albums?"),
    ).length;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => (url as string).startsWith("/api/albums?")).length,
      ).toBeGreaterThan(before),
    );
  });
});

describe("the week", () => {
  it("does not draw an empty schedule when the routines could not be read", async () => {
    // The grid renders from `?? []`, so the failure mode here is a week that
    // looks wiped rather than unavailable — worse than the other two, because
    // an empty grid also looks editable.
    serverDown();
    render(<Week />, { wrapper });

    expect(await alert()).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps the view switcher reachable so the failure is not a dead end", async () => {
    serverDown();
    render(<Week />, { wrapper });
    await alert();

    expect(screen.getByRole("tab", { name: "Schedule" })).toBeInTheDocument();
  });
});

describe("epics", () => {
  it("does not invite the user to create an epic they may already own", async () => {
    // The empty state carries a "Create an epic" button, so this failure mode
    // does not merely mislead — it prompts a duplicate.
    serverDown();
    render(<Epics />, { wrapper });

    expect(await alert()).toBeInTheDocument();
    expect(screen.queryByText("No epics yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create an epic" })).not.toBeInTheDocument();
  });

  it("refetches on retry", async () => {
    serverDown();
    const user = userEvent.setup();
    render(<Epics />, { wrapper });
    await alert();

    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});

describe("reports", () => {
  it("does not tell someone with a long streak that they have no history", async () => {
    // This screen had two identical "Nothing to report yet" states — one for
    // no history, one reachable only when a read failed.
    serverDown();
    render(<Reports />, { wrapper });

    expect(await alert()).toBeInTheDocument();
    expect(screen.queryByText("Nothing to report yet")).not.toBeInTheDocument();
  });

  it("retries both reports, since either can be the broken one", async () => {
    // Two independent queries feed this screen; retrying one leaves the other
    // failed and the screen still in its error state, with no way forward.
    serverDown();
    const user = userEvent.setup();
    render(<Reports />, { wrapper });
    await alert();

    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    const retried = fetchMock.mock.calls.slice(before).map(([url]) => url as string);
    expect(retried.some((url) => url.startsWith("/api/reports/momentum"))).toBe(true);
    expect(retried.some((url) => url.startsWith("/api/reports/effort"))).toBe(true);
  });

  it("still says there is nothing to report when that is the truth", async () => {
    // The honest empty state has to survive the refactor that removed its twin.
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("/api/reports/momentum")) {
        return json({ today: "2026-07-01", streaks: [], days: [], rates: [], weekdays: [] });
      }
      if (url.startsWith("/api/reports/effort")) {
        return json({ weeks: [], months: [], epics: [], stickers: [] });
      }
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Reports />, { wrapper });

    expect(await screen.findByText("Nothing to report yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("one album", () => {
  const albumRoute = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/albums/alb1"]}>
        <Routes>
          <Route path="/albums/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  it("does not say an album was deleted because the connection dropped", async () => {
    // The single worst lie available to this app: "No such album — it may have
    // been deleted" is indistinguishable from the truth, and the user's only
    // recourse would be to rebuild it.
    offline();
    render(<AlbumDetail />, { wrapper: albumRoute });

    expect(await alert()).toBeInTheDocument();
    expect(screen.queryByText("No such album")).not.toBeInTheDocument();
  });

  it("still says an album is gone when the server says it is gone", async () => {
    // 404 is the one non-401 status with real meaning here, and generalising
    // the error branch is exactly how that copy gets lost.
    failReads(async () => json({ error: "not found" }, 404));
    render(<AlbumDetail />, { wrapper: albumRoute });

    expect(await screen.findByText("No such album")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("treats a server fault as a fault, not as a missing album", async () => {
    serverDown();
    render(<AlbumDetail />, { wrapper: albumRoute });

    expect(await alert()).toBeInTheDocument();
    expect(screen.queryByText("No such album")).not.toBeInTheDocument();
  });
});
