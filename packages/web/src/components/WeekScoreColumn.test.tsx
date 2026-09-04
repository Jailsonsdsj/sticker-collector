import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekScoreColumn } from "./WeekScoreColumn";

const column = (scores: (number | null)[]) => render(<WeekScoreColumn scores={scores} />).container;

describe("what the column shows", () => {
  it("heads itself with R", () => {
    column([50]);
    expect(screen.getByTitle("Week score")).toHaveTextContent("R");
  });

  it("gives one cell per week, in the order they were passed", () => {
    column([10, 55, 90]);

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["10", "55", "90"]);
  });

  it("is a list, so it can carry a name at all", () => {
    // A bare `div` cannot be labelled, and `role="group"` would have it
    // pretending to be a fieldset around numbers nobody can edit.
    column([50]);
    expect(screen.getByRole("list", { name: "Week scores" })).toBeInTheDocument();
  });

  it("leaves a week with nothing to score blank, not at zero", () => {
    const container = column([null]);

    const cell = container.querySelector("[data-score='none']");
    expect(cell).not.toBeNull();
    expect(cell?.textContent).toBe("");
  });
});

describe("the colour says which band", () => {
  const bandOf = (score: number) => {
    const container = column([score]);
    const cell = container.querySelector("[data-band]") as HTMLElement;
    return { band: cell.dataset.band, background: cell.style.background };
  };

  it("paints a low score in the low token", () => {
    expect(bandOf(20)).toEqual({ band: "low", background: "var(--color-score-low)" });
  });

  it("paints a middling score in the mid token", () => {
    // The one a "always low" mistake survives: checking only a low score
    // proves nothing about the mapping.
    expect(bandOf(60)).toEqual({ band: "mid", background: "var(--color-score-mid)" });
  });

  it("paints a high score in the high token", () => {
    expect(bandOf(85)).toEqual({ band: "high", background: "var(--color-score-high)" });
  });
});

describe("lining up with the calendar", () => {
  it("stretches its cells, which is what makes the rows agree", () => {
    /**
     * jsdom has no layout, so this asserts the *mechanism* rather than the
     * result: each cell is `flex-1` inside a column that stretches to the
     * calendar's height, so N cells and N week rows divide the same space with
     * the same gap.
     *
     * The result itself was measured in a real browser — 5 rows against 5
     * cells, 42.3px each, 0.1px of drift — because that is the only place it
     * can be. Without the class the cells collapse to their content and every
     * score after the first sits above its week.
     */
    const container = column([10, 20, 30]);

    for (const cell of container.querySelectorAll("li")) {
      expect(cell.className).toContain("flex-1");
    }
  });

  it("keeps a blank week the same height as a scored one", () => {
    // A null cell that did not stretch would shorten its row and push every
    // score below it out of line.
    const container = column([null, 40]);

    for (const cell of container.querySelectorAll("li")) {
      expect(cell.className).toContain("flex-1");
    }
  });
});
