import type { Occurrence, Task } from "@sticker-collector/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAppTimeZone } from "../lib/timezone";
import { AgendaGrid } from "./AgendaGrid";

/**
 * The agenda has two layouts rather than one that shrinks, so most of what can
 * go wrong here is "the phone got the week grid" or "the week grid ticked the
 * wrong day". jsdom answers no to every media query, so the narrow layout is
 * what these get unless a test says otherwise.
 */

/** 2026-08-17 is a Monday, so index 0 of the week is the start of it. */
const DATES = [
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
  "2026-08-22",
  "2026-08-23",
];
const MONDAY = "2026-08-17";

const routine = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1",
    epicId: null,
    title: "Gym",
    description: null,
    url: null,
    effortMinutes: 60,
    rewardCoins: 60,
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
  }) as Task;

const done = (taskId: string, scheduledOn: string): Occurrence => ({
  taskId,
  scheduledOn,
  status: "done",
  completedAt: `${scheduledOn}T12:00:00Z`,
  rewardSnapshotCoins: 60,
});

/** jsdom has no layout and no media queries; this is the only way to ask for
 *  the wide layout. */
const widescreen = () =>
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

const view = (props: Partial<Parameters<typeof AgendaGrid>[0]> = {}) =>
  render(
    <AgendaGrid
      routines={[routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })]}
      occurrences={[]}
      dates={DATES}
      today={MONDAY}
      {...props}
    />,
  );

beforeEach(() => setAppTimeZone("UTC"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("when nothing has a time", () => {
  it("says so instead of showing an empty grid", () => {
    // On day one this is everyone: slots did not exist before the agenda.
    view({ routines: [routine()] });

    expect(screen.getByText("Nothing has a time yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("on a phone", () => {
  it("shows today only, not the whole week", () => {
    // Seven columns on a phone is fifty pixels each, which turns a task name
    // into three characters.
    view({
      routines: [
        routine({
          id: "a",
          title: "Gym",
          slots: [{ weekday: 0, startMin: 600, endMin: 660 }],
        }),
        routine({
          id: "b",
          title: "Piano",
          slots: [{ weekday: 3, startMin: 600, endMin: 660 }],
        }),
      ],
    });

    expect(screen.getByRole("button", { name: /^Gym/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Piano/ })).not.toBeInTheDocument();
  });

  it("keeps the hour column, because that is the question being asked", () => {
    view({ routines: [routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })] });

    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("says the day is empty rather than showing bare hours", () => {
    view({ routines: [routine({ slots: [{ weekday: 4, startMin: 600, endMin: 660 }] })] });

    expect(screen.getByText("Nothing scheduled.")).toBeInTheDocument();
  });

  it("can reach the rest of the week", async () => {
    // Without the day picker a phone sees today and nothing else — six days the
    // grid is already holding would be unreachable, and so would ticking one
    // off after the fact.
    const user = userEvent.setup();
    view({
      routines: [
        routine({ id: "a", title: "Gym", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] }),
        routine({ id: "b", title: "Piano", slots: [{ weekday: 3, startMin: 600, endMin: 660 }] }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "TH" }));

    expect(screen.getByRole("button", { name: /^Piano/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Gym/ })).not.toBeInTheDocument();
  });

  it("names the date once it is not today any more", () => {
    // "Thu" alone does not say which Thursday is about to be ticked off.
    view({
      routines: [routine({ slots: [{ weekday: 3, startMin: 600, endMin: 660 }] })],
    });

    fireEvent.click(screen.getByRole("button", { name: "TH" }));

    // Loose on the order: the date is formatted in the reader's locale, and
    // "Aug 20" and "20 Aug" are the same fact.
    expect(screen.getByText(/^Thu · .*\b20\b/)).toBeInTheDocument();
  });

  it("marks today in the picker even while another day is shown", () => {
    // Two colour utilities on one button is a coin toss — Tailwind resolves the
    // conflict by stylesheet order, not by the order they are written.
    view({ routines: [routine({ slots: [{ weekday: 3, startMin: 600, endMin: 660 }] })] });

    fireEvent.click(screen.getByRole("button", { name: "TH" }));
    const monday = screen.getByRole("button", { name: "MO" });

    expect(monday).toHaveClass("text-cyan");
    expect(monday).not.toHaveClass("text-ink-muted");
  });

  it("opens on today, not on the first day of the week", () => {
    view({
      routines: [routine({ slots: [{ weekday: 3, startMin: 600, endMin: 660 }] })],
      today: "2026-08-20", // a Thursday
    });

    expect(screen.getByRole("button", { name: "TH" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "MO" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("on a wide screen", () => {
  it("shows the whole week", () => {
    widescreen();
    view({
      routines: [
        routine({ id: "a", title: "Gym", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] }),
        routine({ id: "b", title: "Piano", slots: [{ weekday: 3, startMin: 600, endMin: 660 }] }),
      ],
    });

    expect(screen.getByRole("button", { name: /^Gym/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Piano/ })).toBeInTheDocument();
  });

  it("places each block in its own day column", () => {
    // Monday is column 2 — the hour column is 1. A block in the wrong column is
    // the failure a week grid cannot show you any other way.
    widescreen();
    view({
      routines: [
        routine({ id: "a", title: "Gym", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] }),
        routine({ id: "b", title: "Piano", slots: [{ weekday: 3, startMin: 600, endMin: 660 }] }),
      ],
    });

    expect(screen.getByRole("button", { name: /^Gym/ })).toHaveStyle({ gridColumn: "2" });
    expect(screen.getByRole("button", { name: /^Piano/ })).toHaveStyle({ gridColumn: "5" });
  });

  it("spans a block across the hours it covers", () => {
    // 09:30–11:30 starts in the 09:00 row and finishes in the 11:00 one, so it
    // covers three rows of a grid whose first hour is 09:00.
    widescreen();
    view({ routines: [routine({ slots: [{ weekday: 0, startMin: 570, endMin: 690 }] })] });

    expect(screen.getByRole("button", { name: /^Gym/ })).toHaveStyle({ gridRow: "2 / 5" });
  });
});

describe("a block that is done", () => {
  it("stays readable — a wash, not a fill", () => {
    view({
      routines: [routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })],
      occurrences: [done("t1", MONDAY)],
    });

    const block = screen.getByRole("button", { name: /Gym/ });
    expect(block).toHaveStyle({
      background: "color-mix(in srgb, var(--color-lime) 18%, transparent)",
    });
    expect(screen.getByText("Gym")).toHaveClass("line-through");
  });

  it("says it in the name as well as the colour", () => {
    // A green wash alone is nothing to a screen reader.
    view({
      routines: [routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })],
      occurrences: [done("t1", MONDAY)],
      onToggle: () => {},
    });

    const block = screen.getByRole("button", { name: "Gym, 10:00–11:00, done" });
    expect(block).toHaveAttribute("aria-pressed", "true");
  });

  it("counts a tick still inside the undo window", () => {
    view({
      routines: [routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })],
      onToggle: () => {},
      isPending: () => true,
    });

    expect(screen.getByRole("button", { name: /, done$/ })).toBeInTheDocument();
  });
});

describe("the block happening now", () => {
  it("is the one marked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:10:00Z"));
    view({
      routines: [
        routine({ id: "a", title: "Now", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] }),
        routine({ id: "b", title: "Later", slots: [{ weekday: 0, startMin: 900, endMin: 960 }] }),
      ],
    });

    expect(screen.getByRole("button", { name: /^Now/ })).toHaveClass("ring-2");
    expect(screen.getByRole("button", { name: /^Later/ })).not.toHaveClass("ring-2");
  });

  it("is read in the app's zone, not the device's", () => {
    // 13:10 UTC is 10:10 in São Paulo. Reading the device clock instead is the
    // bug this app has already paid for three times.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T13:10:00Z"));
    setAppTimeZone("America/Sao_Paulo");
    view({
      routines: [routine({ title: "Now", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })],
    });

    expect(screen.getByRole("button", { name: /^Now/ })).toHaveClass("ring-2");
  });
});

describe("the now line", () => {
  it("sits in the current hour's row, part of the way down it", () => {
    // 10:30 with the grid starting at 10:00 — first hour row, halfway.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:30:00Z"));
    view({ routines: [routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })] });

    expect(screen.getByTestId("now-line")).toHaveStyle({ gridRow: "1", top: "50%" });
  });

  it("is gone when now is outside the hours on screen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T23:00:00Z"));
    view({ routines: [routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })] });

    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
  });

  it("is not drawn on a day that is not today", () => {
    // A "now" line on Thursday's page says nothing true.
    // fireEvent rather than userEvent: its pointer sequence waits on real
    // timers, which the frozen clock above never advances.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:30:00Z"));
    view({
      routines: [
        routine({ id: "a", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] }),
        routine({ id: "b", title: "Piano", slots: [{ weekday: 3, startMin: 600, endMin: 660 }] }),
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "TH" }));

    expect(screen.getByRole("button", { name: /^Piano/ })).toBeInTheDocument();
    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
  });
});

describe("a day that has not happened yet", () => {
  it("is inert — T-05 refuses a completion before its day", () => {
    widescreen();
    const onToggle = vi.fn();
    view({
      routines: [routine({ title: "Later", slots: [{ weekday: 3, startMin: 600, endMin: 660 }] })],
      onToggle,
    });

    expect(screen.getByRole("button", { name: /^Later/ })).toBeDisabled();
  });

  it("leaves a day already past tappable, which is the point of the picker", () => {
    widescreen();
    view({
      routines: [routine({ title: "Gone", slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })],
      today: "2026-08-20",
      onToggle: () => {},
    });

    expect(screen.getByRole("button", { name: /^Gone/ })).toBeEnabled();
  });
});

describe("ticking a block", () => {
  it("hands back the day it was tapped on, not just the task", async () => {
    // A completion is keyed by (task, date). A week grid that reports only the
    // task ticks whichever day the server guesses.
    const onToggle = vi.fn();
    const user = userEvent.setup();
    widescreen();
    view({
      routines: [routine({ slots: [{ weekday: 3, startMin: 600, endMin: 660 }] })],
      // Sunday, so Thursday's block is behind us and still tappable.
      today: "2026-08-23",
      onToggle,
    });

    await user.click(screen.getByRole("button", { name: /^Gym/ }));

    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-08-20", done: false }),
    );
  });

  it("is not tappable when the agenda is read-only", () => {
    view({ routines: [routine({ slots: [{ weekday: 0, startMin: 600, endMin: 660 }] })] });

    expect(screen.getByRole("button", { name: /^Gym/ })).toBeDisabled();
  });
});
