import { IMAGE_KINDS, IMAGE_SIZES } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageCropper } from "./ImageCropper";

/**
 * jsdom has no canvas and no layout, so the crop itself is untestable here —
 * it is arithmetic, and it is tested exhaustively in `shared/image.test.ts`.
 *
 * What IS testable, and what broke when a third image kind arrived, is the
 * frame: it is the crop preview, so its shape has to be the shape the export
 * produces. A frame that disagrees lets the user position one window and ship
 * another, silently and correctly-looking.
 */
const file = () => new File([new Uint8Array([0xff, 0xd8])], "photo.jpg", { type: "image/jpeg" });

const view = (kind: (typeof IMAGE_KINDS)[number]) => {
  const { container } = render(
    <ImageCropper file={file()} kind={kind} onCommit={vi.fn()} onCancel={vi.fn()} />,
  );
  return container.querySelector("[style*='aspect-ratio']") as HTMLElement;
};

describe("the crop frame", () => {
  it("is shaped like the kind it is cropping for, every kind", () => {
    for (const kind of IMAGE_KINDS) {
      const { width, height } = IMAGE_SIZES[kind];
      expect(view(kind).style.aspectRatio).toBe(`${width} / ${height}`);
    }
  });

  it("is square for a puzzle, not the 5:7 the print kinds use", () => {
    // The literal that was there before. A square image dragged inside a 5:7
    // window is the failure this replaced.
    expect(view("puzzle").style.aspectRatio).toBe("1536 / 1536");
    expect(view("sticker").style.aspectRatio).not.toBe("1536 / 1536");
  });

  it("still offers the way out, whatever the shape", () => {
    render(<ImageCropper file={file()} kind="puzzle" onCommit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});
