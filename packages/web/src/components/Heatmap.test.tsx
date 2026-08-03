import type { DayTally } from "@sticker-collector/shared";
import { addDays, weekdayOf } from "@sticker-collector/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("the calendar is Monday-first", () => {
  it("puts a Monday in the first column and a Sunday in the last", () => {
    // A Sunday-first calendar puts every date one column out and looks
    // entirely plausible.
    // Both dates are in July, the month this opens on. 2026-07-05 is a Sunday.
    render(<Heatmap days={run(7)} today={MONDAY} />);

    expect(cell(MONDAY).dataset.col).toBe("0");
    expect(cell("2026-07-05").dataset.col).toBe("6");
  });

  it("labels the columns Mon to Sun", () => {
    render(<Heatmap days={run(7)} today={SUNDAY} />);
    const labels = [...document.querySelectorAll("[aria-hidden='true']")]
      .map((node) => node.textContent)
      .filter((text) => text && text.length === 1);
    expect(labels.slice(0, 7)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  });

  it("pads the first week rather than shifting it", () => {
    // 2026-07-01 is a Wednesday. A month that starts mid-week must leave the
    // Monday and Tuesday cells empty, not slide every date two columns left.
    render(<Heatmap days={run(12)} today={MONDAY} />);

    expect(cell("2026-07-01").dataset.col).toBe("2");
    expect(cell("2026-07-06").dataset.col).toBe("0"); // the following Monday
  });

  it("leaves exactly the right number of blanks before the 1st", () => {
    // 2026-07-01 is a Wednesday: Monday and Tuesday are blank, and nothing
    // else. Padding by one too many shifts every date a column and still looks
    // like a calendar.
    render(<Heatmap days={run(12)} today={MONDAY} />);

    expect(document.querySelectorAll("[data-pad]")).toHaveLength(2);
  });

  it("runs the month in date order", () => {
    render(<Heatmap days={run(14)} today={MONDAY} />);

    const rendered = [...document.querySelectorAll("[data-date]")].map(
      (node) => (node as HTMLElement).dataset.date,
    );
    expect(rendered[0]).toBe("2026-07-01");
    expect(rendered.at(-1)).toBe("2026-07-31");
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
    expect(screen.getByLabelText("Completion calendar")).toBeInTheDocument();
  });
});

describe("one month at a time", () => {
  it("opens on the month the user is living in, not on the oldest one", () => {
    // A year of history would otherwise land the reader in last August.
    render(<Heatmap days={run(366)} today={addDays(MONDAY, 200)} />);

    expect(screen.getByText(monthLabelOf(addDays(MONDAY, 200)))).toBeInTheDocument();
    expect(document.querySelectorAll("[data-date]")).toHaveLength(
      daysInMonthOf(addDays(MONDAY, 200)),
    );
  });

  it("moves a month at a time, and stops at the ends of the history", async () => {
    const user = userEvent.setup();
    render(<Heatmap days={run(60)} today={MONDAY} />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
    // 60 days from 27 July reaches September, so August is a step forward and
    // there is nothing before July.
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("August 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();

    // September is the last month with history, and there is nothing beyond it
    // to page into — an empty month is not a report.
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("falls back to the newest month it has when today is past the history", () => {
    // The report window ends where the data ends. Opening on a month with no
    // data at all would look like a wiped year.
    render(<Heatmap days={run(3)} today="2026-11-15" />);

    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });

  it("draws the days of the month that have no data, without claiming anything about them", () => {
    // July has 31 days; the history here covers three. The rest are drawn so
    // the month keeps its shape, but "nothing scheduled" would be a claim about
    // days nobody has data for.
    render(<Heatmap days={run(3)} today={MONDAY} />);

    expect(document.querySelectorAll("[data-date]")).toHaveLength(31);
    expect(document.querySelectorAll("[data-level='none']")).toHaveLength(28);
    expect(
      screen.getByRole("img", { name: "2026-07-01: outside the reported period" }),
    ).toBeInTheDocument();
  });

  it("renders an untouched month as empty cells rather than nothing", () => {
    const days = Array.from({ length: 5 }, (_, i) => day(addDays(MONDAY, i), 0, 0));
    render(<Heatmap days={days} today={MONDAY} />);

    expect(document.querySelectorAll("[data-level='empty']")).toHaveLength(5);
  });

  it("renders nothing at all when there is no history to show", () => {
    render(<Heatmap days={[]} today={MONDAY} />);
    expect(screen.queryByLabelText("Completion calendar")).not.toBeInTheDocument();
  });
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const monthLabelOf = (date: string) =>
  `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

const daysInMonthOf = (date: string) =>
  new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();

/** A finger, in two events, on the month grid. */
const swipe = (dx: number, dy = 0) => {
  const grid = document.querySelector("[data-date]")?.parentElement as HTMLElement;
  fireEvent.pointerDown(grid, { pointerType: "touch", clientX: 0, clientY: 0 });
  fireEvent.pointerUp(grid, { pointerType: "touch", clientX: dx, clientY: dy });
};

describe("swiping between months", () => {
  it("goes forward on a left swipe and back on a right one", () => {
    render(<Heatmap days={run(60)} today={MONDAY} />);
    expect(screen.getByText("July 2026")).toBeInTheDocument();

    swipe(-120);
    expect(screen.getByText("August 2026")).toBeInTheDocument();

    // Right means "back", the way pages turn.
    swipe(120);
    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });

  it("refuses to swipe past the history", () => {
    render(<Heatmap days={run(60)} today={MONDAY} />);

    swipe(120);

    // July is the oldest month there is; a swipe into June would show a blank
    // grid the buttons already refuse to reach.
    expect(screen.getByText("July 2026")).toBeInTheDocument();

    // And the refusal has to leave no residue. Storing June and merely
    // *displaying* July looks identical here, but then costs two swipes to
    // reach August — the gesture appears to be ignored every other time.
    swipe(-120);
    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("ignores a short drag and a vertical one", () => {
    render(<Heatmap days={run(60)} today={MONDAY} />);

    swipe(-30);
    expect(screen.getByText("July 2026")).toBeInTheDocument();

    // The page scrolls through this grid. A calendar that changed month on a
    // diagonal scroll would be unusable on a phone.
    swipe(-120, 200);
    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });

  it("leaves a mouse alone", () => {
    render(<Heatmap days={run(60)} today={MONDAY} />);
    const grid = document.querySelector("[data-date]")?.parentElement as HTMLElement;

    fireEvent.pointerDown(grid, { pointerType: "mouse", clientX: 0, clientY: 0 });
    fireEvent.pointerUp(grid, { pointerType: "mouse", clientX: -200, clientY: 0 });

    // A drag with a mouse is a selection, not a page turn.
    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });
});

describe("the month slides in", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** jsdom answers "no" to every media query unless told otherwise. */
  const withMotion = () =>
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("no-preference"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));

  it("enters from the side the last month left towards", async () => {
    withMotion();
    const fromTo = vi.spyOn(gsap, "fromTo").mockReturnValue({} as ReturnType<typeof gsap.fromTo>);
    const user = userEvent.setup();

    render(<Heatmap days={run(60)} today={MONDAY} />);
    // Opening is not a step.
    expect(fromTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(fromTo.mock.calls[0]?.[1]).toMatchObject({ xPercent: 25 });

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(fromTo.mock.calls[1]?.[1]).toMatchObject({ xPercent: -25 });

    fromTo.mockRestore();
  });

  it("does not animate a swipe that was refused", () => {
    // At the oldest month a backwards swipe changes nothing, so it must not
    // play a slide either — an animation that ends where it started reads as
    // the app failing to keep up.
    withMotion();
    const fromTo = vi.spyOn(gsap, "fromTo").mockReturnValue({} as ReturnType<typeof gsap.fromTo>);

    render(<Heatmap days={run(60)} today={MONDAY} />);
    swipe(120);

    expect(fromTo).not.toHaveBeenCalled();
    fromTo.mockRestore();
  });

  it("changes month without animating when motion is unwelcome", async () => {
    const fromTo = vi.spyOn(gsap, "fromTo");
    const user = userEvent.setup();

    render(<Heatmap days={run(60)} today={MONDAY} />);
    await user.click(screen.getByRole("button", { name: "Next month" }));

    expect(fromTo).not.toHaveBeenCalled();
    expect(screen.getByText("August 2026")).toBeInTheDocument();
    fromTo.mockRestore();
  });
});

describe("opening a day's review", () => {
  it("makes a day with work in it pressable, and says so", async () => {
    const onSelectDay = vi.fn();
    const user = userEvent.setup();
    render(<Heatmap days={run(3)} today={MONDAY} onSelectDay={onSelectDay} />);

    const cell = screen.getByRole("button", { name: new RegExp(`${MONDAY}.*Review this day`) });
    await user.click(cell);

    expect(onSelectDay).toHaveBeenCalledWith(MONDAY);
  });

  it("leaves a day with nothing finished as a picture", () => {
    // A dialog reading "you finished nothing that day" is a punishment, not a
    // review.
    render(<Heatmap days={[day(MONDAY, 2, 0)]} today={MONDAY} onSelectDay={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Review this day/ })).toBeNull();
    expect(screen.getByRole("img", { name: `${MONDAY}: 0 of 2 completed` })).toBeInTheDocument();
  });

  it("leaves every cell inert when no handler is given", () => {
    render(<Heatmap days={run(3)} today={MONDAY} />);

    expect(screen.queryByRole("button", { name: /Review this day/ })).toBeNull();
  });
});
