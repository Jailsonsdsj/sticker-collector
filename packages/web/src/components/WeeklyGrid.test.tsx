import type { Task } from "@sticker-collector/shared";
import {
  maskFromDays,
  WEEKDAYS,
  WEEKDAYS_MASK_WEEKDAYS,
  type Weekday,
} from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeeklyGrid } from "./WeeklyGrid";

/**
 * The test TD-01 owes: a cell must flip the correct bit of the weekday mask.
 *
 * Bit 0 is Monday. The grid renders Monday-first, so a Sunday-first index would
 * look entirely correct on screen while moving every routine by one day — the
 * kind of bug that only shows up as "why did this fire on Tuesday?".
 */

const MONDAY = "2026-08-03"; // a Monday, so today's column is the first one

function routine(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    epicId: null,
    title: "Stretch",
    description: null,
    url: null,
    effortMinutes: 15,
    rewardCoins: 15,
    priority: "medium",
    type: "routine",
    weekdays: 0,
    startsOn: null,
    endsOn: null,
    dueAt: null,
    pinnedOn: null,
    startedAt: null,
    slots: [],
    subtasks: [],
    blockUntilSteps: false,
    createdAt: "2026-07-01T00:00:00Z",
    deletedAt: null,
    lastCompletedOn: null,
    ...over,
  };
}

function setup(routines: Task[] = [routine({ weekdays: maskFromDays([0]) })]) {
  const onChangeMask = vi.fn();
  render(<WeeklyGrid routines={routines} today={MONDAY} onChangeMask={onChangeMask} />);
  return { onChangeMask, user: userEvent.setup() };
}

const cell = (title: string, day: string) =>
  screen.getByRole("checkbox", { name: `${title} — ${day}` });

describe("a cell flips its own bit — bit 0 is Monday", () => {
  it.each(WEEKDAYS.map((day, index) => [day, index] as const))(
    "%s toggles bit %i",
    async (day, index) => {
      // Seed with some OTHER day, so the day under test is always being added
      // and the last-remaining-day rule never disables the cell we are clicking.
      const seed = (index === 6 ? 5 : 6) as Weekday;
      const { onChangeMask, user } = setup([routine({ weekdays: maskFromDays([seed]) })]);

      await user.click(cell("Stretch", day));

      expect(onChangeMask).toHaveBeenCalledExactlyOnceWith(
        "t1",
        maskFromDays([seed, index as Weekday]),
      );
    },
  );

  it("puts Saturday in bit 5 and Sunday in bit 6, not the other way round", async () => {
    const { onChangeMask, user } = setup([routine({ weekdays: maskFromDays([0]) })]);
    await user.click(cell("Stretch", "Sat"));
    expect(onChangeMask).toHaveBeenCalledWith("t1", 0b0100001); // Mon + Sat
  });
});

describe("the done-when — five taps, no form", () => {
  it("turns a routine into Mon–Fri in five taps", async () => {
    // The mask the component would hold after each tap; the parent owns state,
    // so the test plays that role and feeds the new mask back in.
    let mask = 0;
    const onChangeMask = vi.fn((_id: string, next: number) => {
      mask = next;
    });
    const user = userEvent.setup();

    const { rerender } = render(
      <WeeklyGrid
        routines={[routine({ weekdays: mask })]}
        today={MONDAY}
        onChangeMask={onChangeMask}
      />,
    );

    let taps = 0;
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      await user.click(cell("Stretch", day));
      taps += 1;
      rerender(
        <WeeklyGrid
          routines={[routine({ weekdays: mask })]}
          today={MONDAY}
          onChangeMask={onChangeMask}
        />,
      );
    }

    expect(taps).toBe(5);
    expect(mask).toBe(WEEKDAYS_MASK_WEEKDAYS);
    expect(mask).toBe(31);

    // "no form opened" — the grid has no dialog and nothing to open one.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("removing days", () => {
  it("clears a bit when an active day is tapped", async () => {
    const { onChangeMask, user } = setup([
      routine({ weekdays: maskFromDays([0, 1] as Weekday[]) }),
    ]);
    await user.click(cell("Stretch", "Mon"));
    expect(onChangeMask).toHaveBeenCalledWith("t1", maskFromDays([1]));
  });

  it("refuses to remove the last remaining day — a routine with none is not a routine", async () => {
    const { onChangeMask, user } = setup([routine({ weekdays: maskFromDays([2]) })]);

    const only = cell("Stretch", "Wed");
    expect(only).toBeDisabled();

    await user.click(only);
    expect(onChangeMask).not.toHaveBeenCalled();
  });

  it("re-enables the others once a second day is on", () => {
    setup([routine({ weekdays: maskFromDays([0, 1] as Weekday[]) })]);
    expect(cell("Stretch", "Mon")).toBeEnabled();
    expect(cell("Stretch", "Tue")).toBeEnabled();
  });
});

describe("the grid itself", () => {
  it("shows one row per routine, with its reward", () => {
    setup([
      routine({ id: "a", title: "Stretch", weekdays: maskFromDays([0]), rewardCoins: 15 }),
      routine({ id: "b", title: "Read", weekdays: maskFromDays([1]), rewardCoins: 40 }),
    ]);
    expect(screen.getByText("Stretch")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("+40")).toBeInTheDocument();
  });

  it("renders the columns Monday-first, matching the bit order", () => {
    setup();
    const headers = screen.getAllByText(/^(MO|TU|WE|TH|FR|SA|SU)$/);
    expect(headers.map((h) => h.textContent)).toEqual(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
  });

  it("reflects the stored mask", () => {
    setup([routine({ weekdays: WEEKDAYS_MASK_WEEKDAYS })]);
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      expect(cell("Stretch", day)).toBeChecked();
    }
    for (const day of ["Sat", "Sun"]) {
      expect(cell("Stretch", day)).not.toBeChecked();
    }
  });

  it("says so when there are no routines, rather than showing an empty table", () => {
    render(<WeeklyGrid routines={[]} today={MONDAY} onChangeMask={vi.fn()} />);
    expect(screen.getByText(/no routines yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("is inert while a save is in flight", async () => {
    const onChangeMask = vi.fn();
    const user = userEvent.setup();
    render(
      <WeeklyGrid
        routines={[routine({ weekdays: maskFromDays([0, 1] as Weekday[]) })]}
        today={MONDAY}
        onChangeMask={onChangeMask}
        disabled
      />,
    );
    await user.click(cell("Stretch", "Wed"));
    expect(onChangeMask).not.toHaveBeenCalled();
  });
});

describe("the epic colour", () => {
  it("paints a row's leading edge with its epic's accent", () => {
    // The same left edge the home screen uses, so an epic reads as one colour
    // wherever its tasks appear.
    render(
      <WeeklyGrid
        routines={[routine({ id: "t1", title: "Stretch" })]}
        accentOf={() => "epic-2"}
        today={MONDAY}
        onChangeMask={vi.fn()}
      />,
    );

    const label = screen.getByText("Stretch").parentElement as HTMLElement;
    expect(label.style.getPropertyValue("--ui-epic")).toBe("var(--color-epic-2)");
  });

  it("falls back to the neutral edge when a task has no epic", () => {
    render(
      <WeeklyGrid
        routines={[routine({ id: "t1", title: "Stretch" })]}
        today={MONDAY}
        onChangeMask={vi.fn()}
      />,
    );

    const label = screen.getByText("Stretch").parentElement as HTMLElement;
    expect(label.style.getPropertyValue("--ui-epic")).toBe("var(--color-epic-none)");
  });

  it("shows a long title in full rather than truncating it", () => {
    // The column is narrow, and a truncated title routinely hid the word that
    // told two routines apart.
    const long = "Stretch shoulders, hips and lower back before the run";
    render(
      <WeeklyGrid
        routines={[routine({ id: "t1", title: long })]}
        today={MONDAY}
        onChangeMask={vi.fn()}
      />,
    );

    const label = screen.getByText(long);
    expect(label).toBeInTheDocument();
    expect(label.className).not.toContain("truncate");
    expect(label.className).toContain("break-words");
  });
});

/** The box a checkbox actually draws — the input itself is `sr-only`. */
const box = (title: string, day: string) =>
  cell(title, day).parentElement?.querySelector("span[aria-hidden]") as HTMLElement;

describe("saying which day is today", () => {
  it("draws one outline around today's column, not a halo per cell", () => {
    // Seven small halos down a column read as seven separate states rather
    // than one day, and "is this row's box for today?" took counting.
    const { container } = render(
      <WeeklyGrid
        routines={[routine({ weekdays: maskFromDays([0, 1]) })]}
        today={MONDAY}
        onChangeMask={vi.fn()}
      />,
    );

    const outline = container.querySelector("[class*='border-ring-today']") as HTMLElement;
    expect(outline).not.toBeNull();
    // Monday is the second grid column (the first holds the row labels), and
    // it spans the header plus the one task row.
    expect(outline.style.gridColumn).toBe("2 / 3");
    expect(outline.style.gridRow).toBe("1 / 3");
    // Out of flow, or it would occupy those cells and shove every column along
    // by one — which is exactly what the first attempt did.
    expect(outline.className).toContain("absolute");
    expect(outline.className).toContain("pointer-events-none");
  });

  it("moves with the day", () => {
    const { container } = render(
      <WeeklyGrid
        routines={[routine({ weekdays: maskFromDays([0]) })]}
        // 2026-08-06 is a Thursday: index 3, so the fifth grid column.
        today="2026-08-06"
        onChangeMask={vi.fn()}
      />,
    );

    expect(
      (container.querySelector("[class*='border-ring-today']") as HTMLElement).style.gridColumn,
    ).toBe("5 / 6");
  });
});

describe("saying which days the routine runs", () => {
  it("gives a scheduled day a heavier edge than an unscheduled one", () => {
    // An empty box meant two things — "not this routine's day" and "this
    // routine's day, not done" — and at the same weight they looked alike.
    setup([routine({ weekdays: maskFromDays([0]) })]);

    expect(box("Stretch", "Mon").className).toContain("border-[3px]");
    expect(box("Stretch", "Tue").className).toContain("border-2");
    expect(box("Stretch", "Tue").className).not.toContain("border-[3px]");
  });
});
