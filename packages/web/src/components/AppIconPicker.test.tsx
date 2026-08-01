import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_APP_ICON, loadAppIcon } from "../lib/appIcon";
import { AppIconPicker } from "./AppIconPicker";

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = `
    <link rel="apple-touch-icon" href="/icons/icon-180.png" />
    <link rel="icon" href="/icons/icon-32.png" />
    <link rel="manifest" href="/manifest.webmanifest" />`;
});

const apple = () =>
  document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? "";

describe("picking an app icon", () => {
  it("offers every icon, with the current one marked", () => {
    render(<AppIconPicker />);

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /star/i })).toBeChecked();
  });

  it("groups the options under one name, so the arrow keys move between them", () => {
    // The reason these are radios rather than buttons. Grouping is what gives
    // a keyboard a single stop with four answers instead of four stops — and
    // jsdom cannot press an arrow key to prove it, so the name is the pin.
    render(<AppIconPicker />);

    const names = new Set(screen.getAllByRole("radio").map((input) => input.getAttribute("name")));
    expect(names.size).toBe(1);
  });

  it("remembers the choice and moves the document's icon at the same time", async () => {
    const user = userEvent.setup();
    render(<AppIconPicker />);

    await user.click(screen.getByRole("radio", { name: /coin/i }));

    expect(loadAppIcon()).toBe("coin");
    // Applied on the tap, not at some later reload the user will not connect
    // to it.
    expect(apple()).toContain("/app-icons/coin/icon-180.png");
    expect(screen.getByRole("radio", { name: /coin/i })).toBeChecked();
  });

  it("opens on what was chosen last time, not on the default", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AppIconPicker />);
    await user.click(screen.getByRole("radio", { name: /pink sticker/i }));
    unmount();

    render(<AppIconPicker />);

    expect(screen.getByRole("radio", { name: /pink sticker/i })).toBeChecked();
    expect(DEFAULT_APP_ICON).not.toBe("sticker-pink");
  });

  it("says that an icon already on the home screen will not change", () => {
    // The single most surprising thing about this feature: iOS copies the
    // artwork at "Add to Home Screen" and never looks again.
    render(<AppIconPicker />);

    expect(screen.getByText(/remove it and add it once more/i)).toBeInTheDocument();
  });
});
