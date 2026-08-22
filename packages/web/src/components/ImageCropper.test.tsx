import { FIXED_IMAGE_KINDS, IMAGE_SIZES } from "@sticker-collector/shared";
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

const view = (kind: "sticker" | "cover" | "puzzle") => {
  const { container } = render(
    <ImageCropper file={file()} kind={kind} onCommit={vi.fn()} onCancel={vi.fn()} />,
  );
  return container.querySelector("[style*='aspect-ratio']") as HTMLElement;
};

describe("the crop frame", () => {
  it("is shaped like the kind it is cropping for", () => {
    // A frame that disagrees with the export lets the user position one window
    // and ship another, looking entirely correct while doing it.
    for (const kind of FIXED_IMAGE_KINDS) {
      const { width, height } = IMAGE_SIZES[kind];
      expect(view(kind).style.aspectRatio).toBe(`${width} / ${height}`);
    }
  });

  it("takes the picture's own shape for a puzzle, not a fixed one", () => {
    // A puzzle is scaled rather than cropped, so there is no target shape to
    // preview — the frame follows the file. (jsdom decodes nothing, so the
    // fallback is what shows here; the point is that it is NOT the box.)
    expect(view("puzzle").style.aspectRatio).not.toBe(
      `${IMAGE_SIZES.puzzle.width} / ${IMAGE_SIZES.puzzle.height}`,
    );
  });

  it("says the whole picture is kept, rather than offering a drag", () => {
    render(<ImageCropper file={file()} kind="puzzle" onCommit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/whole picture is kept/i)).toBeInTheDocument();
    expect(screen.queryByText(/drag to reposition/i)).not.toBeInTheDocument();
  });

  it("still offers the drag for a kind that is cropped", () => {
    render(<ImageCropper file={file()} kind="cover" onCommit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/drag to reposition/i)).toBeInTheDocument();
  });

  it("still offers the way out, whatever the shape", () => {
    render(<ImageCropper file={file()} kind="puzzle" onCommit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});
