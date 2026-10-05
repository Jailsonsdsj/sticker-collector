import type { WeekReport } from "@sticker-collector/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeekReportSheet } from "./WeekReportSheet";

const MONDAY = "2026-07-27";

const body: WeekReport = {
  weekStart: MONDAY,
  generatedAt: "2026-08-02T22:00:00Z",
  routines: [
    {
      taskId: "gym",
      title: "Gym",
      epicTitle: null,
      epicAccent: null,
      cells: ["done", "off", "late", "off", "missed", "off", "off"],
    },
  ],
  others: [
    {
      taskId: "call",
      title: "Call the bank",
      epicTitle: "Home",
      epicAccent: "epic-2",
      doneOn: "2026-07-29",
      coins: 45,
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fetchMock = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("a week's report", () => {
  it("asks for that week, by its Monday", async () => {
    render(<WeekReportSheet weekStart={MONDAY} score={60} onClose={vi.fn()} />, { wrapper });

    await screen.findByText("Gym");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/reports/week/${MONDAY}`);
  });

  it("grids each routine day by day — done, late, missed and off", async () => {
    render(<WeekReportSheet weekStart={MONDAY} score={60} onClose={vi.fn()} />, { wrapper });

    expect(await screen.findByLabelText("Gym, Mon: done")).toBeInTheDocument();
    expect(screen.getByLabelText("Gym, Wed: done late")).toBeInTheDocument();
    expect(screen.getByLabelText("Gym, Fri: missed")).toBeInTheDocument();
    expect(screen.getByLabelText("Gym, Tue: not scheduled")).toBeInTheDocument();
  });

  it("counts only the runs done on their own day", async () => {
    render(<WeekReportSheet weekStart={MONDAY} score={60} onClose={vi.fn()} />, { wrapper });

    expect(await screen.findByText("1/3")).toBeInTheDocument();
  });

  it("lists everything else done that week below the grid", async () => {
    render(<WeekReportSheet weekStart={MONDAY} score={60} onClose={vi.fn()} />, { wrapper });

    const others = await screen.findByRole("region", { name: "Also done this week" });
    expect(within(others).getByText("Call the bank")).toBeInTheDocument();
    expect(within(others).getByText("Wed")).toBeInTheDocument();
    expect(within(others).getByText("+45")).toBeInTheDocument();
  });

  it("leads with the week's score", async () => {
    render(<WeekReportSheet weekStart={MONDAY} score={60} onClose={vi.fn()} />, { wrapper });

    expect(await screen.findByLabelText("Week score 60 out of 100")).toBeInTheDocument();
  });

  it("renders nothing when no week is open", () => {
    const { container } = render(
      <WeekReportSheet weekStart={null} score={null} onClose={vi.fn()} />,
      { wrapper },
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
