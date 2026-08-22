import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { CreateChoiceDialog } from "./CreateChoiceDialog";

/**
 * The fork the Create button became. Two destinations, and the dialog's only
 * job is to reach the right one and get out of the way.
 */
const open = (onClose = vi.fn()) => {
  const router = createMemoryRouter(
    [
      { path: "/albums", element: <CreateChoiceDialog open onClose={onClose} /> },
      { path: "/albums/new", element: <p>album wizard</p> },
      { path: "/puzzles/new", element: <p>puzzle form</p> },
    ],
    { initialEntries: ["/albums"] },
  );
  render(<RouterProvider router={router} />);
  return { onClose };
};

describe("choosing what to make", () => {
  it("offers both, and says what each one is", () => {
    // Not two bare buttons: an album and a puzzle are not the same size of
    // undertaking, and a row of two would make them look interchangeable.
    open();

    expect(screen.getByText(/set of stickers/i)).toBeInTheDocument();
    expect(screen.getByText(/cut into a grid/i)).toBeInTheDocument();
  });

  it("goes to the album wizard", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Album" }));

    expect(await screen.findByText("album wizard")).toBeInTheDocument();
  });

  it("goes to the puzzle form", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Jigsaw puzzle" }));

    expect(await screen.findByText("puzzle form")).toBeInTheDocument();
  });

  it("closes itself on the way, so it is not still open behind the form", async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.click(screen.getByRole("button", { name: "Jigsaw puzzle" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("shows nothing when closed", () => {
    const router = createMemoryRouter(
      [{ path: "/", element: <CreateChoiceDialog open={false} onClose={vi.fn()} /> }],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.queryByRole("button", { name: "Album" })).not.toBeInTheDocument();
  });
});
