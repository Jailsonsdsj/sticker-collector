import type { OwnedSticker } from "@sticker-collector/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SWIPE_COMMIT_PX } from "../lib/swipe";
import { StickerViewer } from "./StickerViewer";

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

const sticker = (over: Partial<OwnedSticker> = {}): OwnedSticker => ({
  id: "stk1",
  albumId: "alb1",
  imageKey: key(1),
  title: null,
  description: null,
  tier: "common",
  slotIndex: 0,
  quantity: 1,
  ...over,
});

const three = [
  sticker({ id: "a", imageKey: key(1), title: "Red Fox" }),
  sticker({ id: "b", imageKey: key(2), title: "Grey Wolf" }),
  sticker({ id: "c", imageKey: key(3), title: "Barn Owl" }),
];

function setup(index: number | null = 0, stickers = three) {
  const onIndex = vi.fn();
  const onClose = vi.fn();
  render(<StickerViewer stickers={stickers} index={index} onIndex={onIndex} onClose={onClose} />);
  return { onIndex, onClose };
}

/** A finger, in three events. */
const swipe = (element: HTMLElement, dx: number, dy = 0) => {
  fireEvent.pointerDown(element, { pointerType: "touch", clientX: 0, clientY: 0 });
  fireEvent.pointerUp(element, { pointerType: "touch", clientX: dx, clientY: dy });
};

const surface = () => screen.getByText("1 of 3").parentElement as HTMLElement;

describe("looking at one sticker", () => {
  it("shows its picture", () => {
    setup();
    expect(screen.getByRole("presentation", { hidden: true })).toBeInTheDocument();
  });

  it("shows the words the author wrote, in one block", () => {
    // One scrolling block, not a fixed title above a scrolling description:
    // that reads as two panels rather than a caption that happens to be long.
    render(
      <StickerViewer
        stickers={[sticker({ title: "Red Fox", description: "Seen at dusk." })]}
        index={0}
        onIndex={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Red Fox" });
    expect(screen.getByText("Seen at dusk.")).toBe(heading.nextElementSibling);
  });

  it("scrolls the block rather than the page", () => {
    render(
      <StickerViewer
        stickers={[sticker({ title: "Red Fox", description: "x".repeat(2000) })]}
        index={0}
        onIndex={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const block = screen.getByRole("heading", { name: "Red Fox" }).parentElement as HTMLElement;
    expect(block.className).toContain("overflow-y-auto");
  });

  it("says nothing where the author wrote nothing", () => {
    render(<StickerViewer stickers={[sticker()]} index={0} onIndex={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders nothing at all when closed", () => {
    setup(null);
    expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
  });
});

describe("moving through the collection", () => {
  it("swipes left to the next one, without closing", () => {
    const { onIndex, onClose } = setup();

    swipe(surface(), -(SWIPE_COMMIT_PX + 10));

    expect(onIndex).toHaveBeenCalledWith(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("swipes right to go back, the way pages turn", () => {
    const { onIndex } = setup(1);

    swipe(screen.getByText("2 of 3").parentElement as HTMLElement, SWIPE_COMMIT_PX + 10);

    expect(onIndex).toHaveBeenCalledWith(0);
  });

  it("ignores a drag down the page", () => {
    const { onIndex } = setup();
    swipe(surface(), -40, 200);
    expect(onIndex).not.toHaveBeenCalled();
  });

  it("stops at the ends rather than wrapping", () => {
    // Running off the end of a collection should stop, not silently start it
    // again — wrapping makes it impossible to tell you have reached the end.
    const { onIndex } = setup(0);
    swipe(surface(), SWIPE_COMMIT_PX + 10);
    expect(onIndex).not.toHaveBeenCalled();
  });

  it("moves with the arrow keys, which a swipe cannot do", () => {
    // The viewer is the only way to read a description, so it has to be
    // reachable without a touchscreen.
    const { onIndex } = setup();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenCalledWith(1);
  });

  it("says where you are", () => {
    setup(1);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });
});
