import type { OwnedSticker } from "@sticker-collector/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSticker } from "../lib/saveImage";
import { SWIPE_COMMIT_PX } from "../lib/swipe";
import { StickerViewer } from "./StickerViewer";

vi.mock("../lib/saveImage", () => ({ saveSticker: vi.fn() }));

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

/** The viewer only animates when motion is welcome; jsdom answers "no" to every
 *  media query unless told otherwise. */
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

describe("sliding between stickers", () => {
  afterEach(() => vi.unstubAllGlobals());

  const renderAt = (index: number) => {
    const view = render(
      <StickerViewer stickers={three} index={index} onIndex={vi.fn()} onClose={vi.fn()} />,
    );
    return (next: number) =>
      view.rerender(
        <StickerViewer stickers={three} index={next} onIndex={vi.fn()} onClose={vi.fn()} />,
      );
  };

  it("enters from the side the last one left towards", async () => {
    withMotion();
    const fromTo = vi.spyOn(gsap, "fromTo").mockReturnValue({} as ReturnType<typeof gsap.fromTo>);
    const user = userEvent.setup();

    const go = renderAt(0);
    // Opening is not a step: the sheet is already animating itself in.
    expect(fromTo).not.toHaveBeenCalled();

    // Forward: the new sticker comes in from the right.
    await user.keyboard("{ArrowRight}");
    go(1);
    expect(fromTo.mock.calls[0]?.[1]).toMatchObject({ xPercent: 60 });

    // Back: from the left, or "previous" would feel identical to "next".
    await user.keyboard("{ArrowLeft}");
    go(0);
    expect(fromTo.mock.calls[1]?.[1]).toMatchObject({ xPercent: -60 });

    fromTo.mockRestore();
  });

  it("changes the sticker without animating when motion is unwelcome", () => {
    const fromTo = vi.spyOn(gsap, "fromTo");

    const go = renderAt(0);
    go(1);

    expect(fromTo).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    fromTo.mockRestore();
  });
});

describe("saving a sticker to the device", () => {
  it("saves the one being looked at, under a name taken from its title", async () => {
    const user = userEvent.setup();
    setup(1);

    await user.click(screen.getByRole("button", { name: /save image/i }));

    expect(saveSticker).toHaveBeenCalledWith(key(2), "Grey Wolf");
  });

  it("says so when it fails, instead of failing silently", async () => {
    vi.mocked(saveSticker).mockRejectedValueOnce(new Error("nope"));
    const user = userEvent.setup();
    setup(0);

    await user.click(screen.getByRole("button", { name: /save image/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not be saved/i));
  });

  it("labels the button rather than writing the word Download", () => {
    setup(0);

    const button = screen.getByRole("button", { name: /save image/i });
    // Icon only, by request — but an icon with no accessible name is a button
    // nobody who cannot see it can use.
    expect(button).toHaveTextContent("");
    expect(button).toHaveAccessibleName();
  });
});
