import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImagePicker } from "./ImagePicker";

/**
 * Importing a batch.
 *
 * The cropper decodes a real image, which jsdom cannot do, so it is stubbed at
 * the module boundary: these tests are about the *queue* — how many images are
 * positioned, in what order, and what reaches the draft — not about cropping.
 */
vi.mock("../ImageCropper", () => ({
  ImageCropper: ({
    file,
    commitLabel,
    onCommit,
    onBack,
    onCancel,
  }: {
    file: File;
    commitLabel?: string;
    onCommit: (bytes: Uint8Array) => void;
    onBack?: () => void;
    onCancel: () => void;
  }) => (
    <div>
      <p>positioning {file.name}</p>
      <button type="button" onClick={() => onCommit(new Uint8Array([1]))}>
        {commitLabel ?? "Use this image"}
      </button>
      {onBack && (
        <button type="button" onClick={onBack}>
          Back
        </button>
      )}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

const uploaded: string[] = [];
vi.mock("../../lib/imageUpload", () => ({
  uploadImage: async () => {
    const key = `img/${String(uploaded.length + 1).padStart(64, "0")}.jpg`;
    uploaded.push(key);
    return { key };
  },
  imageSrc: (key: string) => `/api/images/${key}`,
}));

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

function setup(multiple = true) {
  const onPicked = vi.fn();
  render(
    <ImagePicker kind="sticker" label="Add stickers" multiple={multiple} onPicked={onPicked} />,
  );
  return onPicked;
}

const pick = (names: string[]) =>
  fireEvent.change(screen.getByLabelText("Add stickers"), {
    target: { files: names.map(file) },
  });

beforeEach(() => {
  uploaded.length = 0;
});

describe("a batch", () => {
  it("positions the images one after another, in order", async () => {
    const user = userEvent.setup();
    setup();
    pick(["a.jpg", "b.jpg", "c.jpg"]);

    expect(await screen.findByText("positioning a.jpg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("positioning b.jpg")).toBeInTheDocument();
  });

  it("says where you are in the batch", async () => {
    setup();
    pick(["a.jpg", "b.jpg", "c.jpg"]);

    expect(await screen.findByText(/Position the sticker 1 of 3/)).toBeInTheDocument();
  });

  it("hands back one key per image, as each is positioned", async () => {
    const user = userEvent.setup();
    const onPicked = setup();
    pick(["a.jpg", "b.jpg"]);

    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));

    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(2));
  });

  it("closes once the last one is done", async () => {
    const user = userEvent.setup();
    setup();
    pick(["a.jpg"]);

    await user.click(await screen.findByRole("button", { name: "Use this image" }));

    await waitFor(() => expect(screen.queryByText(/positioning/)).not.toBeInTheDocument());
  });

  it("can step back to re-position an earlier image", async () => {
    const user = userEvent.setup();
    setup();
    pick(["a.jpg", "b.jpg"]);

    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Back" }));

    expect(await screen.findByText("positioning a.jpg")).toBeInTheDocument();
  });

  it("offers no Back on the first image", async () => {
    setup();
    pick(["a.jpg", "b.jpg"]);

    await screen.findByText("positioning a.jpg");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("abandons the whole batch on cancel", async () => {
    const user = userEvent.setup();
    const onPicked = setup();
    pick(["a.jpg", "b.jpg"]);

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/positioning/)).not.toBeInTheDocument();
    expect(onPicked).not.toHaveBeenCalled();
  });
});

describe("a single image", () => {
  it("keeps the original wording, with no batch counter", async () => {
    setup(false);
    pick(["a.jpg"]);

    expect(await screen.findByRole("button", { name: "Use this image" })).toBeInTheDocument();
    expect(screen.queryByText(/1 of 1/)).not.toBeInTheDocument();
  });

  it("does not let the file input take several", () => {
    setup(false);
    expect(screen.getByLabelText("Add stickers")).not.toHaveAttribute("multiple");
  });
});
