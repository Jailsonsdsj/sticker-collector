import type { Occurrence, Task } from "@sticker-collector/shared";
import { maskFromDays, WEEKDAYS_MASK_WEEKDAYS, type Weekday } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { weekDates } from "../lib/week";
import { WeeklyCompletionGrid } from "./WeeklyCompletionGrid";

/**
 * Two of the four cell states are refusals, and those are the ones worth
 * pinning: a day the routine does not run, and a day that has not happened yet.
 * Both must fire nothing at all — the API refuses the second with a 400.
 */

const TODAY = "2026-08-05"; // a Wednesday
const DATES = weekDates(TODAY); // Mon 03 … Sun 09

const routine = (over: Partial<Task> = {}): Task => ({
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
  slots: [],
  subtasks: [],
  blockUntilSteps: false,
  createdAt: "2026-07-01T00:00:00Z",
  deletedAt: null,
  lastCompletedOn: null,
  ...over,
});

const occ = (taskId: string, scheduledOn: string, status: Occurrence["status"]): Occurrence => ({
  taskId,
  scheduledOn,
  status,
  completedAt: status === "done" ? "2026-08-05T10:00:00Z" : null,
  rewardSnapshotCoins: status === "done" ? 15 : null,
});

function setup(props: Partial<Parameters<typeof WeeklyCompletionGrid>[0]> = {}) {
  const onToggle = vi.fn();
  const isPending = vi.fn().mockReturnValue(false);
  render(
    <WeeklyCompletionGrid
      routines={[routine()]}
      occurrences={[]}
      dates={DATES}
      today={TODAY}
      isPending={isPending}
      onToggle={onToggle}
      {...props}
    />,
  );
  return { onToggle, isPending, user: userEvent.setup() };
}

const cell = (day: string, title = "Stretch") =>
  screen.getByRole("checkbox", { name: `${title} — ${day}` });

describe("a day the routine does not run", () => {
  it("is inert and fires nothing", async () => {
    const { onToggle, user } = setup({ routines: [routine({ weekdays: maskFromDays([0]) })] });

    expect(cell("Tue")).toBeDisabled();
    await user.click(cell("Tue"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("is not counted in the week's total", () => {
    setup({ routines: [routine({ weekdays: maskFromDays([0, 1] as Weekday[]) })] });
    expect(screen.getByText("0/2")).toBeInTheDocument(); // two scheduled days, not seven
  });
});

describe("a day still ahead", () => {
  it("is inert — you cannot finish work you have not done", async () => {
    const { onToggle, user } = setup();

    // Today is Wednesday, so Thursday and Friday are scheduled but not yet real.
    expect(cell("Thu")).toBeDisabled();
    expect(cell("Fri")).toBeDisabled();

    await user.click(cell("Thu"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("still counts toward the week's total, because it is scheduled", () => {
    setup();
    expect(screen.getByText("0/5")).toBeInTheDocument(); // Mon–Fri
  });
});

describe("a day that has happened", () => {
  it("is tappable and reports the task and the date", async () => {
    const { onToggle, user } = setup();
    await user.click(cell("Mon"));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("t1", "2026-08-03", true);
  });

  it("today itself is tappable", async () => {
    const { onToggle, user } = setup();
    await user.click(cell("Wed"));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("t1", TODAY, true);
  });

  it("shows a completed day as ticked, and unticking reports false", async () => {
    const { onToggle, user } = setup({ occurrences: [occ("t1", "2026-08-03", "done")] });

    expect(cell("Mon")).toBeChecked();
    await user.click(cell("Mon"));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("t1", "2026-08-03", false);
  });

  it("leaves a missed day unticked but tappable", async () => {
    const { onToggle, user } = setup({ occurrences: [occ("t1", "2026-08-03", "missed")] });
    expect(cell("Mon")).not.toBeChecked();
    await user.click(cell("Mon"));
    expect(onToggle).toHaveBeenCalledWith("t1", "2026-08-03", true);
  });
});

describe("the undo window", () => {
  it("shows a pending completion as already ticked", () => {
    // The cell has to move the instant it is tapped, even though nothing has
    // been sent yet — that is the whole point of the deferred completion.
    setup({ isPending: (id, date) => id === "t1" && date === "2026-08-04" });
    expect(cell("Tue")).toBeChecked();
    expect(cell("Mon")).not.toBeChecked();
  });

  it("counts it as done", () => {
    setup({ isPending: (_id, date) => date === "2026-08-04" });
    expect(screen.getByText("1/5")).toBeInTheDocument();
  });
});

describe("the week's tally", () => {
  it("counts done over scheduled, across every routine", () => {
    setup({
      routines: [
        routine({ id: "a", title: "Stretch", weekdays: maskFromDays([0, 1] as Weekday[]) }),
        routine({ id: "b", title: "Read", weekdays: maskFromDays([0]) }),
      ],
      occurrences: [occ("a", "2026-08-03", "done"), occ("b", "2026-08-03", "done")],
    });
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("says so when there is nothing to tick", () => {
    setup({ routines: [] });
    expect(screen.getByText(/no routines yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("the grid itself", () => {
  it("renders the columns Monday-first, matching the mask's bit order", () => {
    setup();
    const headers = screen.getAllByText(/^(MO|TU|WE|TH|FR|SA|SU)$/);
    expect(headers.map((h) => h.textContent)).toEqual(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
  });

  it("lines each cell up with its own date", async () => {
    const { onToggle, user } = setup({ routines: [routine({ weekdays: 0b1111111 })] });
    await user.click(cell("Sun"));
    // Sunday is inert here (still ahead of Wednesday), so nothing fires — but
    // Monday, two days behind, must map to the Monday date and not to today.
    expect(onToggle).not.toHaveBeenCalled();

    await user.click(cell("Mon"));
    expect(onToggle).toHaveBeenCalledWith("t1", "2026-08-03", true);
  });
});

const boxOf = (day: string, title = "Stretch") =>
  cell(day, title).parentElement?.querySelector("span[aria-hidden]") as HTMLElement;

describe("telling a scheduled day from an unscheduled one", () => {
  it("gives the scheduled day the heavier edge, and the unscheduled one the muted dot", () => {
    // The confusion this fixes: an empty box on a day the routine does not run
    // looked like an empty box on a day it does.
    setup();

    expect(boxOf("Mon").className).toContain("border-[3px]");
    // Muted cells keep their own hairline treatment — they are inert, and a
    // heavy edge on something you cannot tick is a promise the grid breaks.
    expect(boxOf("Sat").className).not.toContain("border-[3px]");
  });

  it("outlines today's column once, rather than ringing each cell", () => {
    setup();

    const outlines = document.querySelectorAll("[class*='border-ring-today']");
    expect(outlines).toHaveLength(1);
    // Header plus one task row, and out of flow so it takes no cells.
    expect((outlines[0] as HTMLElement).style.gridRow).toBe("1 / 3");
    expect((outlines[0] as HTMLElement).className).toContain("absolute");
  });
});
