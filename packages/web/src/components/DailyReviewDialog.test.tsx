import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DailyReview } from "../lib/dailyReview";
import { DailyReviewDialog } from "./DailyReviewDialog";

const review = (over: Partial<DailyReview> = {}): DailyReview => ({
  date: "2026-08-02",
  rows: [
    { taskId: "t1", title: "Water the plants", epic: "Home", epicAccent: "epic-3", coins: 30 },
    { taskId: "t2", title: "Post the form", epic: null, epicAccent: null, coins: 12 },
  ],
  coins: 42,
  score: 67,
  scheduled: 3,
  done: 2,
  ...over,
});

describe("reading a day back", () => {
  it("lists each task with its epic and what it paid", () => {
    render(<DailyReviewDialog review={review()} onClose={vi.fn()} />);

    expect(screen.getByText("Water the plants")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("+30")).toBeInTheDocument();
    expect(screen.getByText("Post the form")).toBeInTheDocument();
  });

  it("leads with the day's total", () => {
    render(<DailyReviewDialog review={review()} onClose={vi.fn()} />);

    expect(screen.getByText(/2 things finished/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("counts one thing as one thing", () => {
    render(
      <DailyReviewDialog
        review={review({ rows: review().rows.slice(0, 1), coins: 30 })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/One thing finished/)).toBeInTheDocument();
  });

  it("is titled by the caller — Yesterday on the prompt, the date from the calendar", () => {
    const { unmount } = render(
      <DailyReviewDialog review={review()} heading="Yesterday" onClose={vi.fn()} />,
    );
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    unmount();

    render(<DailyReviewDialog review={review()} onClose={vi.fn()} />);
    expect(screen.getByText("2026-08-02")).toBeInTheDocument();
  });

  it("scrolls a long day instead of running off the dialog", () => {
    render(<DailyReviewDialog review={review()} onClose={vi.fn()} />);

    const list = screen.getByRole("list");
    expect(list.className).toContain("max-h-[60vh]");
    expect(list.className).toContain("overflow-y-auto");
  });

  it("gets the wider panel, being the one dialog that carries a list", () => {
    // A confirmation is a sentence and two buttons; this is a day's work.
    render(<DailyReviewDialog review={review()} onClose={vi.fn()} />);

    const panel = document.querySelector("dialog") as HTMLElement;
    expect(panel.className).toContain("36rem");
    expect(panel.className).not.toContain("28rem");
  });

  it("stays shut when there is nothing to show", () => {
    render(<DailyReviewDialog review={null} onClose={vi.fn()} />);

    expect(screen.queryByText(/things finished/)).not.toBeInTheDocument();
  });

  it("closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DailyReviewDialog review={review()} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Nice" }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe("a long title", () => {
  it("is shown in full rather than cut off", () => {
    const long = "Water the plants, both balconies and the kitchen windowsill";
    render(
      <DailyReviewDialog
        review={review({
          rows: [{ taskId: "t1", title: long, epic: null, epicAccent: null, coins: 30 }],
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(long).className).not.toContain("truncate");
  });
});

describe("how the day scored", () => {
  it("leads with the score, because it is the one number that says how it went", () => {
    render(
      <DailyReviewDialog review={review({ score: 67, done: 2, scheduled: 3 })} onClose={vi.fn()} />,
    );

    expect(screen.getByText("67")).toBeInTheDocument();
  });

  it("says the fraction it is short for", () => {
    // A percentage alone hides whether the day held two things or twenty.
    render(
      <DailyReviewDialog review={review({ score: 67, done: 2, scheduled: 3 })} onClose={vi.fn()} />,
    );

    expect(screen.getByText("2 of 3 scheduled")).toBeInTheDocument();
  });

  it("shows no score for a day that held nothing scheduled", () => {
    // A rest day is not a nought. The list still stands: finishing something
    // unscheduled is still finishing something.
    render(
      <DailyReviewDialog
        review={review({ score: null, done: 0, scheduled: 0 })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText(/scheduled$/)).not.toBeInTheDocument();
    expect(screen.getByText(/things finished/)).toBeInTheDocument();
  });

  it("colours it by band", () => {
    const { rerender } = render(
      <DailyReviewDialog review={review({ score: 20 })} onClose={vi.fn()} />,
    );
    expect(screen.getByText("20").style.color).toContain("--color-prio-high-fg");

    rerender(<DailyReviewDialog review={review({ score: 60 })} onClose={vi.fn()} />);
    expect(screen.getByText("60").style.color).toContain("--color-coin");

    rerender(<DailyReviewDialog review={review({ score: 90 })} onClose={vi.fn()} />);
    expect(screen.getByText("90").style.color).toContain("--color-lime");
  });
});
