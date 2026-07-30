import type { DayTally } from "@sticker-collector/shared";
import { addDays, weekdayOf } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heatmap, heatLevel } from "./Heatmap";

/** 2026-07-27 is a Monday — every row claim below is checkable by hand. */
const MONDAY = "2026-07-27";
const SUNDAY = "2026-08-02";

const day = (date: string, scheduled: number, done: number): DayTally => ({
  date,
  scheduled,
  done,
});

/** A run of days starting Monday, all identical. */
const run = (length: number, scheduled = 1, done = 1): DayTally[] =>
  Array.from({ length }, (_, i) => day(addDays(MONDAY, i), scheduled, done));

const cell = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement;
const levelOf = (date: string) => cell(date).dataset.level;

it("is anchored on a real Monday", () => {
  expect(weekdayOf(MONDAY)).toBe(0);
  expect(weekdayOf(SUNDAY)).toBe(6);
});

describe("a gap is visible at a glance", () => {
  it("shows a missed day differently from a day with nothing scheduled", () => {
    // The whole point of the view. If these two looked the same, every rest day
    // would read as a failure and every failure as a rest day.
    render(
      <Heatmap
        days={[day(MONDAY, 2, 0), day(addDays(MONDAY, 1), 0, 0)]}
        today={addDays(MONDAY, 1)}
      />,
    );

    expect(levelOf(MONDAY)).toBe("missed");
    expect(levelOf(addDays(MONDAY, 1))).toBe("empty");
    expect(levelOf(MONDAY)).not.toBe(levelOf(addDays(MONDAY, 1)));
  });

  it("paints those two states with different colours, not just labels", () => {
    render(<Heatmap days={[day(MONDAY, 2, 0), day(addDays(MONDAY, 1), 0, 0)]} today={MONDAY} />);
    expect(cell(MONDAY).style.background).not.toBe(cell(addDays(MONDAY, 1)).style.background);
  });

  it("separates a finished day from a half-finished one", () => {
    render(<Heatmap days={[day(MONDAY, 4, 4), day(addDays(MONDAY, 1), 4, 2)]} today={MONDAY} />);
    expect(levelOf(MONDAY)).toBe("4");
    expect(levelOf(addDays(MONDAY, 1))).toBe("2");
  });

  it("gives every completion step its own shade", () => {
    const shades = new Set(
      [
        heatLevel(day(MONDAY, 0, 0)),
        heatLevel(day(MONDAY, 4, 0)),
        heatLevel(day(MONDAY, 4, 1)),
        heatLevel(day(MONDAY, 4, 2)),
        heatLevel(day(MONDAY, 4, 3)),
        heatLevel(day(MONDAY, 4, 4)),
      ].map(String),
    );
    expect(shades.size).toBe(6);
  });

  it("counts a day done when everything scheduled was completed", () => {
    expect(heatLevel(day(MONDAY, 1, 1))).toBe(4);
    expect(heatLevel(day(MONDAY, 3, 3))).toBe(4);
  });
});

describe("the grid is Monday-first", () => {
  it("puts a Monday in the top row and a Sunday in the bottom one", () => {
    // A Sunday-first grid puts every cell one row out and looks plausible.
    render(<Heatmap days={run(7)} today={SUNDAY} />);

    expect(cell(MONDAY).dataset.row).toBe("0");
    expect(cell(SUNDAY).dataset.row).toBe("6");
  });

  it("labels the rows Mon to Sun", () => {
    render(<Heatmap days={run(7)} today={SUNDAY} />);
    const labels = [...document.querySelectorAll("[aria-hidden='true']")]
      .map((node) => node.textContent)
      .filter((text) => text && text.length === 1);
    expect(labels.slice(0, 7)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  });

  it("keeps every weekday in its own row when the year starts mid-week", () => {
    // A partial first week must pad, not shift.
    const wednesday = addDays(MONDAY, 2);
    const days = Array.from({ length: 12 }, (_, i) => day(addDays(wednesday, i), 1, 1));
    render(<Heatmap days={days} today={addDays(wednesday, 11)} />);

    expect(cell(wednesday).dataset.row).toBe("2");
    expect(cell(addDays(wednesday, 5)).dataset.row).toBe("0"); // the next Monday
  });

  it("runs oldest week first", () => {
    const days = run(14);
    render(<Heatmap days={days} today={addDays(MONDAY, 13)} />);

    const rendered = [...document.querySelectorAll("[data-date]")].map(
      (node) => (node as HTMLElement).dataset.date,
    );
    expect(rendered[0]).toBe(MONDAY);
    expect(rendered.at(-1)).toBe(addDays(MONDAY, 13));
  });
});

describe("reading it without colour", () => {
  it("says what each day contained", () => {
    // By role, not by label alone: an `aria-label` on an element with no role is
    // not exposed to assistive tech, and a label query would pass regardless.
    render(<Heatmap days={[day(MONDAY, 3, 2)]} today={MONDAY} />);
    expect(screen.getByRole("img", { name: `${MONDAY}: 2 of 3 completed` })).toBeInTheDocument();
  });

  it("says so when nothing was scheduled", () => {
    render(<Heatmap days={[day(MONDAY, 0, 0)]} today={MONDAY} />);
    expect(screen.getByRole("img", { name: `${MONDAY}: nothing scheduled` })).toBeInTheDocument();
  });

  it("marks today", () => {
    render(<Heatmap days={run(3)} today={addDays(MONDAY, 1)} />);
    expect(cell(addDays(MONDAY, 1)).className).toContain("ring-ring-today");
    expect(cell(MONDAY).className).not.toContain("ring-ring-today");
  });

  it("names itself for a screen reader", () => {
    render(<Heatmap days={run(3)} today={MONDAY} />);
    expect(screen.getByLabelText("Completion heatmap")).toBeInTheDocument();
  });
});

describe("a year of cells", () => {
  it("renders one per day", () => {
    render(<Heatmap days={run(366)} today={addDays(MONDAY, 365)} />);
    expect(document.querySelectorAll("[data-date]")).toHaveLength(366);
  });

  it("renders an untouched year as empty cells rather than nothing", () => {
    const days = Array.from({ length: 90 }, (_, i) => day(addDays(MONDAY, i), 0, 0));
    render(<Heatmap days={days} today={addDays(MONDAY, 89)} />);

    expect(document.querySelectorAll("[data-level='empty']")).toHaveLength(90);
  });

  it("renders nothing at all when there is no history to show", () => {
    render(<Heatmap days={[]} today={MONDAY} />);
    expect(screen.queryByLabelText("Completion heatmap")).not.toBeInTheDocument();
  });
});
