import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteAlbumDialog } from "./DeleteAlbumDialog";

function renderDialog(props: Partial<Parameters<typeof DeleteAlbumDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <DeleteAlbumDialog
      open
      title="Kitchen heroes"
      owned={7}
      pending={false}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose, view };
}

const confirm = () => screen.getByRole("button", { name: "Delete for good" });
const box = () => screen.getByLabelText(/type the album's title/i);

describe("the wall in front of the delete", () => {
  it("starts refusing", async () => {
    renderDialog();
    expect(confirm()).toBeDisabled();
  });

  it("keeps refusing a wrong title", async () => {
    renderDialog();
    await userEvent.type(box(), "Kitchen villains");
    expect(confirm()).toBeDisabled();
  });

  it("keeps refusing a partial title", async () => {
    renderDialog();
    await userEvent.type(box(), "Kitchen");
    expect(confirm()).toBeDisabled();
  });

  it("keeps refusing when the box is emptied again", async () => {
    renderDialog();
    await userEvent.type(box(), "Kitchen heroes");
    expect(confirm()).toBeEnabled();

    await userEvent.clear(box());
    expect(confirm()).toBeDisabled();
  });

  it("opens once the title is typed", async () => {
    renderDialog();
    await userEvent.type(box(), "Kitchen heroes");
    expect(confirm()).toBeEnabled();
  });

  it("does not test typing accuracy — case and spacing are forgiven", async () => {
    // Proving intent is the point, not transcription.
    renderDialog();
    await userEvent.type(box(), "  kitchen HEROES  ");
    expect(confirm()).toBeEnabled();
  });
});

describe("what it says before it does it", () => {
  it("names the album, the stickers and the coins", async () => {
    renderDialog({ title: "Kitchen heroes", owned: 7 });

    expect(screen.getByText(/No coins are refunded/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("counts one sticker in the singular", () => {
    renderDialog({ owned: 1 });
    expect(screen.getByText(/sticker collected inside it/)).toBeInTheDocument();
  });
});

describe("acting on it", () => {
  it("deletes when confirmed", async () => {
    const { onConfirm } = renderDialog();
    await userEvent.type(box(), "Kitchen heroes");
    await userEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does nothing when dismissed", async () => {
    const { onConfirm, onClose } = renderDialog();
    await userEvent.type(box(), "Kitchen heroes");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("goes quiet while the delete is in flight", async () => {
    renderDialog({ pending: true });
    await userEvent.type(box(), "Kitchen heroes");
    expect(confirm()).toBeDisabled();
  });

  it("forgets what was typed once it closes", async () => {
    // Otherwise a second delete would open already confirmed.
    const { view } = renderDialog();
    await userEvent.type(box(), "Kitchen heroes");
    expect(confirm()).toBeEnabled();

    view.rerender(
      <DeleteAlbumDialog
        open={false}
        title="Kitchen heroes"
        owned={7}
        pending={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    view.rerender(
      <DeleteAlbumDialog
        open
        title="Kitchen heroes"
        owned={7}
        pending={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(confirm()).toBeDisabled();
  });
});
