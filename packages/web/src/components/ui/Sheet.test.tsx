import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_WIDTH } from "../layout/appWidth";
import { Sheet } from "./Sheet";

/**
 * A sheet fills the viewport, which on a phone is the app. On a monitor it is
 * the whole monitor — so its *contents* are held to the same column as
 * everything else, or Cancel and Save end up half a screen apart.
 */
const open = () =>
  render(
    <Sheet
      open
      onClose={vi.fn()}
      title="Edit task"
      leading={<button type="button">Cancel</button>}
      trailing={<button type="button">Save</button>}
      toolbar={<p>steps</p>}
    >
      <p>the form</p>
    </Sheet>,
  );

describe("a sheet on a wide screen", () => {
  it("still covers the viewport", () => {
    // The point of a sheet is that nothing behind it is reachable; a centred
    // panel with the app showing around it is a dialog, which already exists.
    open();

    const dialog = document.querySelector("dialog") as HTMLElement;
    expect(dialog.className).toContain("h-full");
    expect(dialog.className).toContain("w-full");
  });

  it("holds its header, toolbar and body to the app's column", () => {
    open();

    const row = screen.getByText("Cancel").parentElement?.parentElement as HTMLElement;
    expect(row.className).toContain(APP_WIDTH);
    expect(screen.getByText("steps").parentElement?.className).toContain(APP_WIDTH);
    expect(screen.getByText("the form").parentElement?.className).toContain(APP_WIDTH);
  });

  it("uses the same class the shell does", () => {
    // One constant, three places. The failure mode is one of them drifting.
    open();

    const body = screen.getByText("the form").parentElement as HTMLElement;
    expect(body.className).toContain(APP_WIDTH);
  });
});
