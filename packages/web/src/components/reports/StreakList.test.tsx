import type { StreakReport } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StreakList } from "./StreakList";

/**
 * The ranking is the contract — a streak list that does not lead with the
 * longest run is a list nobody reads twice — plus the one bit of markup that
 * jsdom cannot observe any other way: whether a title is cut off.
 */

const streak = (over: Partial<StreakReport> = {}): StreakReport => ({
  taskId: "t1",
  title: "Morning run",
  current: 3,
  longest: 9,
  lastCompletedOn: "2026-08-20",
  ...over,
});

const view = (streaks: StreakReport[]) =>
  render(<StreakList streaks={streaks} perfect={{ count: 2, current: 1 }} />);

describe("ordering", () => {
  it("leads with the longest run going right now", () => {
    view([
      streak({ taskId: "a", title: "Cold", current: 0, longest: 40 }),
      streak({ taskId: "b", title: "Hot", current: 12, longest: 12 }),
    ]);

    const titles = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(titles[0]).toContain("Hot");
  });

  it("breaks a tie on the best run ever, not on insertion order", () => {
    view([
      streak({ taskId: "a", title: "Newer", current: 5, longest: 5 }),
      streak({ taskId: "b", title: "Older", current: 5, longest: 30 }),
    ]);

    expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("Older");
  });
});

describe("a long title", () => {
  it("is shown in full rather than cut off with an ellipsis", () => {
    // The row also carries a badge and a "best" count, so the title is the part
    // that gives — and it is the part that identifies the streak.
    const long = "Stretch shoulders, hips and lower back before the morning run";
    view([streak({ title: long })]);

    expect(screen.getByText(long).className).not.toContain("truncate");
    expect(screen.getByText(long).className).toContain("break-words");
  });
});
