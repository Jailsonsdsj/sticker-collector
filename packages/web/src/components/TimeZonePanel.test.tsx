import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appTimeZone } from "../lib/timezone";
import { TimeZonePanel } from "./TimeZonePanel";

const DEVICE = "America/Sao_Paulo";

let fetchMock: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const mount = (initial: string) => {
  // Stateful, like the server: a PATCH changes what the next GET says. A mock
  // that kept answering with the old zone would make the refetch look like a
  // regression that only exists in the test.
  let stored = initial;
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") stored = JSON.parse(init.body as string).timezone;
    return json({ userId: "u1", timezone: stored });
  });
  render(<TimeZonePanel />, { wrapper });
};

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation((() => ({
    resolvedOptions: () => ({ timeZone: DEVICE }),
  })) as unknown as typeof Intl.DateTimeFormat);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the timezone setting", () => {
  it("shows both zones, because the disagreement is the bug", async () => {
    mount("Europe/Lisbon");

    expect(await screen.findByText("Europe/Lisbon")).toBeInTheDocument();
    expect(screen.getByText(DEVICE)).toBeInTheDocument();
  });

  it("adopts the account's zone as soon as the profile arrives", async () => {
    // Not only when the user changes it: the app has to count days the
    // server's way from the first screen, or the first tick of the evening is
    // the one that fails.
    mount("Europe/Lisbon");

    await screen.findByText("Europe/Lisbon");
    await waitFor(() => expect(appTimeZone()).toBe("Europe/Lisbon"));
  });

  it("warns when they differ", async () => {
    // The failure it explains: an undated one-off may only be completed today,
    // so the hours the two zones disagree return a 400 on every tick.
    mount("Europe/Lisbon");

    expect(await screen.findByRole("alert")).toHaveTextContent(/disagree/i);
    expect(screen.getByRole("button", { name: `Use ${DEVICE}` })).toBeInTheDocument();
  });

  it("says nothing when they already agree", async () => {
    mount(DEVICE);

    await waitFor(() => expect(screen.getAllByText(DEVICE).length).toBeGreaterThan(0));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Use / })).not.toBeInTheDocument();
  });

  it("saves the device's zone and adopts it immediately", async () => {
    const user = userEvent.setup();
    mount("Europe/Lisbon");
    await screen.findByRole("button", { name: `Use ${DEVICE}` });

    await user.click(screen.getByRole("button", { name: `Use ${DEVICE}` }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(JSON.parse(patch?.[1].body as string)).toEqual({ timezone: DEVICE });
    });
    // Adopted in the same tick: every list is built from a local day, and one
    // stale copy of "today" is the bug all over again.
    await waitFor(() => expect(appTimeZone()).toBe(DEVICE));
  });
});
