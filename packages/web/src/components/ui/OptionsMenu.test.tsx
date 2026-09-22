import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionsMenu, type OptionsMenuItem } from "./OptionsMenu";

// Typed, not inferred from the default: inferring makes `tone` required, and
// the one item written without it stops compiling.
const setup = (
  items: OptionsMenuItem[] = [{ label: "Delete album", onSelect: vi.fn(), tone: "danger" }],
) => {
  const user = userEvent.setup();
  render(
    <div>
      <button type="button">outside</button>
      <OptionsMenu label="Kitchen heroes" items={items} />
    </div>,
  );
  return { user, trigger: screen.getByRole("button", { name: "Options for Kitchen heroes" }) };
};

describe("the trigger", () => {
  it("says what it acts on, so a shelf is not a row of identical buttons", () => {
    setup();
    expect(screen.getByRole("button", { name: "Options for Kitchen heroes" })).toBeInTheDocument();
  });

  it("shows nothing until it is pressed", () => {
    const { trigger } = setup();

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Delete album" })).not.toBeInTheDocument();
  });

  it("opens and closes on repeated presses", async () => {
    const { user, trigger } = setup();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(trigger);
    expect(screen.queryByRole("button", { name: "Delete album" })).not.toBeInTheDocument();
  });

  it("points at the list it opened", async () => {
    // `aria-controls` only means something while there is something to control.
    const { user, trigger } = setup();
    expect(trigger).not.toHaveAttribute("aria-controls");

    await user.click(trigger);

    const id = trigger.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).toBeInTheDocument();
  });
});

describe("choosing something", () => {
  it("runs it", async () => {
    const onSelect = vi.fn();
    const { user, trigger } = setup([{ label: "Delete album", onSelect, tone: "danger" }]);

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Delete album" }));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("closes the menu first, since the action opens a dialog over it", async () => {
    const { user, trigger } = setup();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Delete album" }));

    expect(screen.queryByRole("button", { name: "Delete album" })).not.toBeInTheDocument();
  });

  it("marks a destructive action as one", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    expect(screen.getByRole("button", { name: "Delete album" }).className).toContain(
      "text-magenta",
    );
  });

  it("carries every item it is given", async () => {
    const { user, trigger } = setup([
      { label: "Rename", onSelect: vi.fn() },
      { label: "Delete album", onSelect: vi.fn(), tone: "danger" },
    ]);

    await user.click(trigger);

    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete album" })).toBeInTheDocument();
  });
});

describe("dismissing it", () => {
  it("closes when something else is pressed", async () => {
    // It floats over a card that is a link. Left open, the next tap lands on
    // the menu instead of the thing that was aimed at.
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByRole("button", { name: "Delete album" })).not.toBeInTheDocument();
  });

  it("closes on Escape and hands focus back", async () => {
    // Focus would otherwise sit on an element that no longer exists, and the
    // next Tab would start from somewhere the user has never been.
    //
    // Tabbed INTO the menu first, deliberately. Opening by click leaves focus
    // on the trigger, so it is still there after Escape whether or not
    // anything put it back — the test passed against a version that did not.
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.tab();
    expect(screen.getByRole("button", { name: "Delete album" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Delete album" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("stops listening once it is closed", async () => {
    // The listeners are global. Left attached, every shelf card would keep one
    // for the life of the screen.
    const { user, trigger } = setup();
    const remove = vi.spyOn(document, "removeEventListener");

    await user.click(trigger);
    await user.keyboard("{Escape}");

    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toContain("pointerdown");
    expect(removed).toContain("keydown");
    remove.mockRestore();
  });
});
