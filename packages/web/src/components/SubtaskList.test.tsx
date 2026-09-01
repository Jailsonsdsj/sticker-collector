import type { Subtask } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SubtaskList } from "./SubtaskList";

const TODAY = "2026-09-01";
const YESTERDAY = "2026-08-31";

const step = (over: Partial<Subtask> = {}): Subtask => ({
  id: "s1",
  title: "Fill the can",
  position: 0,
  doneOn: null,
  ...over,
});

const list = (
  subtasks: Subtask[],
  taskType: "routine" | "oneoff" = "routine",
  onToggle = vi.fn(),
) => {
  render(<SubtaskList subtasks={subtasks} taskType={taskType} today={TODAY} onToggle={onToggle} />);
  return onToggle;
};

const titles = () => screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"));

describe("what the list shows", () => {
  it("renders nothing at all when a task has no steps", () => {
    const { container } = render(
      <SubtaskList subtasks={[]} taskType="routine" today={TODAY} onToggle={vi.fn()} />,
    );
    // Not an empty panel: a task without a checklist should look like a task
    // without a checklist, not like one whose checklist failed to load.
    expect(container).toBeEmptyDOMElement();
  });

  it("puts the undone ones first", () => {
    list([
      step({ id: "a", title: "Done one", doneOn: TODAY }),
      step({ id: "b", title: "Still to do", position: 1 }),
    ]);

    expect(titles()).toEqual(["Still to do", "Done one"]);
  });

  it("counts how many are done", () => {
    list([step({ id: "a", doneOn: TODAY }), step({ id: "b", position: 1 })]);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows a routine's yesterday ticks as undone", () => {
    // The whole reason `doneOn` is a date: today is a different run.
    list([step({ id: "a", doneOn: YESTERDAY })]);

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("0/1")).toBeInTheDocument();
  });

  it("keeps a one-off's older ticks, because it has no next run", () => {
    list([step({ id: "a", doneOn: YESTERDAY })], "oneoff");

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("1/1")).toBeInTheDocument();
  });

  it("strikes a finished step through rather than removing it", () => {
    // A list that shortens as you work leaves nothing to look back at.
    list([step({ id: "a", title: "Fill the can", doneOn: TODAY })]);

    expect(screen.getByText("Fill the can").className).toContain("line-through");
  });
});

describe("ticking one", () => {
  it("reports the step and the new state", async () => {
    const user = userEvent.setup();
    const onToggle = list([step({ id: "a" })]);

    await user.click(screen.getByRole("checkbox"));

    expect(onToggle).toHaveBeenCalledWith("a", true);
  });

  it("unticks one that was done", async () => {
    const user = userEvent.setup();
    const onToggle = list([step({ id: "a", doneOn: TODAY })]);

    await user.click(screen.getByRole("checkbox"));

    expect(onToggle).toHaveBeenCalledWith("a", false);
  });

  it("toggles from the words too, not only the box", async () => {
    // The text is a `<label htmlFor>`, so the tap target is the whole row —
    // a 24px box is not a thumb-sized thing to aim at.
    const user = userEvent.setup();
    const onToggle = list([step({ id: "a", title: "Fill the can" })]);

    await user.click(screen.getByText("Fill the can"));

    expect(onToggle).toHaveBeenCalledWith("a", true);
  });
});
