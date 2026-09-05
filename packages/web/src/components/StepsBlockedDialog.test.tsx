import type { Subtask, Task } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepsBlockedDialog } from "./StepsBlockedDialog";

const TODAY = "2026-09-05";

const step = (over: Partial<Subtask> = {}): Subtask => ({
  id: "s1",
  title: "Write it",
  position: 0,
  doneOn: null,
  ...over,
});

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1",
    title: "Ship it",
    type: "routine",
    blockUntilSteps: true,
    subtasks: [step({ id: "a", title: "Write it" }), step({ id: "b", title: "Send it" })],
    ...over,
  }) as Task;

const open = (over: Partial<Task> = {}) =>
  render(<StepsBlockedDialog task={task(over)} today={TODAY} onClose={vi.fn()} />);

describe("why the tick was refused", () => {
  it("names the task and how many steps are left", () => {
    open();

    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByText(/2 are still open/)).toBeInTheDocument();
  });

  it("counts one in the singular, because `1 are` is a bug people notice", () => {
    open({ subtasks: [step({ id: "a", doneOn: TODAY }), step({ id: "b", title: "Send it" })] });

    expect(screen.getByText(/One is still open/)).toBeInTheDocument();
  });

  it("shows WHICH steps, not only how many", () => {
    // "Two left" is a fact about a task; which two is the thing that gets you
    // back to work.
    open();

    expect(screen.getByText("Write it")).toBeInTheDocument();
    expect(screen.getByText("Send it")).toBeInTheDocument();
  });

  it("does not offer to tick them here", () => {
    // An explanation, not a second place to work — the task sheet already does
    // that properly, with the list in its own order and the count beside it.
    open();

    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });

  it("closes on the way out", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StepsBlockedDialog task={task()} today={TODAY} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing at all when nothing was refused", () => {
    // A closed `<dialog>` keeps its DOM, so leaving the body mounted would put
    // a stale task's steps in it.
    const { container } = render(
      <StepsBlockedDialog task={null} today={TODAY} onClose={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
