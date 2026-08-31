import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PuzzleInfoDialog } from "./PuzzleInfoDialog";

const open = (over: Partial<Parameters<typeof PuzzleInfoDialog>[0]> = {}) =>
  render(
    <PuzzleInfoDialog
      open
      title="The harbour"
      description={null}
      spend={{ spent: 230, remaining: 90, total: 320 }}
      onClose={vi.fn()}
      {...over}
    />,
  );

/** The row a label belongs to, so a figure is read against its own label. */
const row = (label: string) => within(screen.getByText(label).parentElement as HTMLElement);

describe("what it says the puzzle has cost", () => {
  it("puts the time first, because that is the question a price does not answer", () => {
    // One coin is one minute — the conversion the wallet already shows.
    // "3h 50m spent" says whether this was an evening or a fortnight; "230"
    // does not.
    open();

    expect(row("Time spent").getByText("3h 50m")).toBeInTheDocument();
    expect(row("Time remaining").getByText("1h 30m")).toBeInTheDocument();
  });

  it("keeps the coins beside it, since that is what the buttons are priced in", () => {
    open();

    expect(row("Time spent").getByText("230")).toBeInTheDocument();
    expect(row("Time remaining").getByText("90")).toBeInTheDocument();
  });

  it("shows the whole picture as well as the split", () => {
    open();
    expect(row("Whole picture").getByText("5h 20m")).toBeInTheDocument();
  });

  it("drops the hours when there are none, rather than printing 0h", () => {
    // A field reading `0h 45m` is a field asking to be read twice.
    open({ spend: { spent: 45, remaining: 0, total: 45 } });

    expect(row("Time spent").getByText("45m")).toBeInTheDocument();
    expect(screen.queryByText(/0h/)).not.toBeInTheDocument();
  });

  it("says nothing is left on a finished puzzle rather than hiding the line", () => {
    open({ spend: { spent: 320, remaining: 0, total: 320 } });
    expect(row("Time remaining").getByText("0m")).toBeInTheDocument();
  });

  it("separates the thousands, because these numbers get large", () => {
    // 144 pieces at 150 is five figures, and `21600` is not a readable number.
    open({ spend: { spent: 0, remaining: 22600, total: 22600 } });
    expect(row("Time remaining").getByText("22,600")).toBeInTheDocument();
  });
});

describe("the description", () => {
  it("shows it when there is one", () => {
    open({ description: "Taken from the north pier at dawn." });
    expect(screen.getByText("Taken from the north pier at dawn.")).toBeInTheDocument();
  });

  it("renders its formatting, the same as a task's notes", () => {
    open({ description: "Taken from the **north** pier." });
    expect(screen.getByText("north").tagName).toBe("STRONG");
  });

  it("says there is none rather than leaving a hole", () => {
    // An absent description and a dialog that failed to load look identical
    // when the space is simply empty.
    open({ description: null });
    expect(screen.getByText("No description.")).toBeInTheDocument();
  });

  it("names the puzzle, so the dialog says what it is about", () => {
    open();
    expect(screen.getByText("The harbour")).toBeInTheDocument();
  });
});

describe("when it is not open", () => {
  it("is closed, and so hidden from the page and its accessibility tree", () => {
    // A native `<dialog>` keeps its children in the DOM and hides them by
    // being closed, so `queryByText` still finds them — asserting on text here
    // would be asserting the wrong thing about the wrong element.
    const { container } = open({ open: false });

    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(screen.queryByText("Time spent")).not.toBeVisible();
  });

  it("is open when it is open, so the check above means something", () => {
    const { container } = open();
    expect(container.querySelector("dialog[open]")).not.toBeNull();
  });
});
