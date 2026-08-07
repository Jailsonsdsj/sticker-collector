import { fireEvent, render, screen } from "@testing-library/react";
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
  const onStart = vi.fn();
  render(
    <SwipeRow onPin={onPin} onStart={onStart} {...props}>
      <p>Buy milk</p>
    </SwipeRow>,
  );
  return { onPin, onStart };
};

describe("swiping right", () => {
  it("starts the task straight away, with nothing to confirm", () => {
    // Both directions are reversible by the opposite swipe, so a confirmation
    // would be a dialog for a decision that costs nothing.
    const { onStart, onPin } = setup();

    swipe(surface(), SWIPE_COMMIT_PX + 10);

    expect(onStart).toHaveBeenCalledOnce();
    expect(onPin).not.toHaveBeenCalled();
  });

  it("does nothing when the finger stopped short", () => {
    const { onStart } = setup();
    swipe(surface(), SWIPE_COMMIT_PX - 10);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("swiping left", () => {
  it("moves the task into today, straight away", () => {
    // It used to open the row and hold a Delete button out from under it.
    // Nothing on this row is destructive any more, so nothing is held back.
    const { onPin, onStart } = setup();

    swipe(surface(), -(SWIPE_COMMIT_PX + 10));

    expect(onPin).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("says why instead, when this row cannot go to today", () => {
    const { onPin } = setup({ pinBlockedReason: "Routines follow their own schedule." });

    swipe(surface(), -(SWIPE_COMMIT_PX + 10));

    expect(onPin).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Routines follow their own schedule.");
  });

  it("offers no Delete anywhere — it moved to the task view", () => {
    // Deleting was the one thing here a stray gesture could do and the user
    // could not undo.
    setup();
    swipe(surface(), -(SWIPE_COMMIT_PX + 10));

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});

describe("what the row says on the way", () => {
  it("names the list each direction is heading for", () => {
    setup();

    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});

describe("gestures that are not swipes", () => {
  it("ignores a drag down the page", () => {
    const { onPin, onStart } = setup();

    swipe(surface(), -40, 200); // scrolling past, at an angle

    expect(onPin).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("ignores the mouse, which has no swipe", () => {
    // A click-drag with a mouse is a selection, not a gesture.
    const { onStart } = setup();
    const element = surface();

    fireEvent.pointerDown(element, { pointerType: "mouse", clientX: 0, clientY: 0 });
    fireEvent.pointerUp(element, { pointerType: "mouse", clientX: 200, clientY: 0 });

    expect(onStart).not.toHaveBeenCalled();
  });

  it("is inert while multi-select owns the screen", () => {
    const { onPin, onStart } = setup({ disabled: true });

    swipe(surface(), SWIPE_COMMIT_PX + 50);
    swipe(surface(), -(SWIPE_COMMIT_PX + 50));

    expect(onPin).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("survives a cancelled pointer without acting", () => {
    const { onStart } = setup();
    const element = surface();

    fireEvent.pointerDown(element, { pointerType: "touch", clientX: 0, clientY: 0 });
    fireEvent.pointerMove(element, { pointerType: "touch", clientX: 200, clientY: 0 });
    fireEvent.pointerCancel(element);

    expect(onStart).not.toHaveBeenCalled();
  });
});
