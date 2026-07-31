import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SWIPE_COMMIT_PX } from "../lib/swipe";
import { SwipeRow } from "./SwipeRow";

/** A finger, in three events. jsdom does no layout, so the coordinates are the
 *  whole story — which is exactly what the swipe rules read. */
function swipe(element: HTMLElement, dx: number, dy = 0) {
  fireEvent.pointerDown(element, { pointerType: "touch", clientX: 0, clientY: 0 });
  fireEvent.pointerMove(element, { pointerType: "touch", clientX: dx, clientY: dy });
  fireEvent.pointerUp(element, { pointerType: "touch", clientX: dx, clientY: dy });
}

const surface = () => screen.getByText("Buy milk").parentElement as HTMLElement;

const setup = (props: Partial<React.ComponentProps<typeof SwipeRow>> = {}) => {
  const onPin = vi.fn();
  const onDelete = vi.fn();
  render(
    <SwipeRow onPin={onPin} onDelete={onDelete} {...props}>
      <p>Buy milk</p>
    </SwipeRow>,
  );
  return { onPin, onDelete };
};

describe("swiping right", () => {
  it("pins straight away, with nothing to confirm", () => {
    // Pinning is reversible, so a confirmation would be a dialog for a decision
    // that costs nothing.
    const { onPin } = setup();

    swipe(surface(), SWIPE_COMMIT_PX + 10);

    expect(onPin).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("says why instead, when this row cannot be pinned", () => {
    const { onPin } = setup({ pinBlockedReason: "Routines follow their own schedule." });

    swipe(surface(), SWIPE_COMMIT_PX + 10);

    expect(onPin).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Routines follow their own schedule.");
  });

  it("does nothing when the finger stopped short", () => {
    const { onPin } = setup();
    swipe(surface(), SWIPE_COMMIT_PX - 10);
    expect(onPin).not.toHaveBeenCalled();
  });
});

describe("swiping left", () => {
  it("opens the row and holds a Delete button out from under it", () => {
    // Not a confirmation dialog and not an immediate delete: the row stays
    // open, and the deletion takes a deliberate press on a real button.
    const { onDelete } = setup();

    swipe(surface(), -(SWIPE_COMMIT_PX + 10));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes when that button is pressed", async () => {
    const user = userEvent.setup();
    const { onDelete } = setup();

    swipe(surface(), -(SWIPE_COMMIT_PX + 10));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("closes again when the row itself is touched", () => {
    const { onDelete } = setup();
    swipe(surface(), -(SWIPE_COMMIT_PX + 10));

    fireEvent.pointerDown(surface(), { pointerType: "touch", clientX: 0, clientY: 0 });

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps the task readable while it is open", () => {
    // The button comes out from under the row, so the thing being deleted is
    // still on screen while you decide.
    setup();
    swipe(surface(), -(SWIPE_COMMIT_PX + 10));

    expect(screen.getByText("Buy milk")).toBeVisible();
  });

  it("offers no Delete target until it has been opened", () => {
    // An always-present button under every row would be an invisible target
    // sitting in the middle of the list.
    setup();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});

describe("gestures that are not swipes", () => {
  it("ignores a drag down the page", () => {
    const { onPin, onDelete } = setup();

    swipe(surface(), -40, 200); // scrolling past, at an angle

    expect(onPin).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("ignores the mouse, which has no swipe", () => {
    // A click-drag with a mouse is a selection, not a gesture.
    const { onPin } = setup();
    const element = surface();

    fireEvent.pointerDown(element, { pointerType: "mouse", clientX: 0, clientY: 0 });
    fireEvent.pointerUp(element, { pointerType: "mouse", clientX: 200, clientY: 0 });

    expect(onPin).not.toHaveBeenCalled();
  });

  it("is inert while multi-select owns the screen", () => {
    const { onPin, onDelete } = setup({ disabled: true });

    swipe(surface(), SWIPE_COMMIT_PX + 50);
    swipe(surface(), -(SWIPE_COMMIT_PX + 50));

    expect(onPin).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("survives a cancelled pointer without acting", () => {
    const { onPin } = setup();
    const element = surface();

    fireEvent.pointerDown(element, { pointerType: "touch", clientX: 0, clientY: 0 });
    fireEvent.pointerMove(element, { pointerType: "touch", clientX: 200, clientY: 0 });
    fireEvent.pointerCancel(element);

    expect(onPin).not.toHaveBeenCalled();
  });
});
