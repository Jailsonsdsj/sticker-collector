import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { QuickAdd } from "./QuickAdd";

/** Reports the current path, so "no navigation" can be asserted rather than assumed. */
function LocationProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function setup(onAdd = vi.fn().mockResolvedValue({ id: "t1" }), pending = false) {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QuickAdd onAdd={onAdd} pending={pending} />
      <LocationProbe />
    </MemoryRouter>,
  );
  return {
    onAdd,
    field: screen.getByRole("textbox", { name: "Quick-add a one-off" }),
    button: screen.getByRole("button", { name: "Add task" }),
    path: () => screen.getByTestId("path").textContent,
  };
}

describe("capture", () => {
  it("submits on Enter", async () => {
    const { onAdd, field } = setup();
    await userEvent.type(field, "Buy milk{Enter}");
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Buy milk");
  });

  it("submits on the + button", async () => {
    const { onAdd, field, button } = setup();
    await userEvent.type(field, "Buy milk");
    await userEvent.click(button);
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Buy milk");
  });

  it("trims before sending", async () => {
    const { onAdd, field } = setup();
    await userEvent.type(field, "   Buy milk   {Enter}");
    expect(onAdd).toHaveBeenCalledWith("Buy milk");
  });
});

describe("nothing is sent for nothing", () => {
  it("issues no request for an empty field", async () => {
    const { onAdd, field } = setup();
    await userEvent.type(field, "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("issues no request for whitespace only", async () => {
    const { onAdd, field, button } = setup();
    await userEvent.type(field, "    ");
    expect(button).toBeDisabled();
    await userEvent.type(field, "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("still refuses when the form is submitted around the disabled button", async () => {
    // The disabled button already blocks Enter, so the guard inside submit() is
    // only reachable this way — and it is the one that would actually stop a
    // programmatic submit from creating an empty task.
    const { onAdd, field } = setup();
    await userEvent.type(field, "   ");
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("no navigation — the done-when", () => {
  it("stays on the same route after a successful add", async () => {
    const { field, path } = setup();
    expect(path()).toBe("/");
    await userEvent.type(field, "Buy milk{Enter}");
    expect(path()).toBe("/"); // capture never costs a screen
  });

  it("prevents the form's default submit", async () => {
    // jsdom does not implement form navigation, so the assertion above cannot
    // see a missing preventDefault. In a browser it would reload the page.
    const { field } = setup();
    await userEvent.type(field, "Buy milk");

    const form = field.closest("form") as HTMLFormElement;
    const event = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("the field afterwards", () => {
  it("clears on success, so the next capture starts empty", async () => {
    const { field } = setup();
    await userEvent.type(field, "Buy milk{Enter}");
    expect(field).toHaveValue("");
  });

  it("keeps the text on failure — a blip must not eat what was typed", async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error("offline"));
    const { field } = setup(onAdd);

    await userEvent.type(field, "Buy milk{Enter}");

    expect(field).toHaveValue("Buy milk");
    expect(screen.getByText(/could not save/i)).toBeInTheDocument();
  });

  it("keeps focus and the caret after a failure, so typing can just continue", async () => {
    // Rendering the error through Input's own `error` slot switches it between
    // a bare <input> and a <Field>-wrapped one — React remounts the node and
    // the user loses focus mid-sentence. This asserts it does not.
    const onAdd = vi.fn().mockRejectedValue(new Error("offline"));
    const { field } = setup(onAdd);

    await userEvent.type(field, "Buy milk{Enter}");

    expect(document.activeElement).toBe(field);
    await userEvent.type(field, " and eggs");
    expect(field).toHaveValue("Buy milk and eggs");
  });

  it("clears the failure once the retry succeeds", async () => {
    const onAdd = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ id: "t1" });
    const { field } = setup(onAdd);

    await userEvent.type(field, "Buy milk{Enter}");
    expect(screen.getByText(/could not save/i)).toBeInTheDocument();

    await userEvent.type(field, "{Enter}");
    expect(field).toHaveValue("");
    expect(screen.queryByText(/could not save/i)).not.toBeInTheDocument();
  });
});

describe("in flight", () => {
  it("refuses a second submit while one is pending", async () => {
    const { onAdd, field, button } = setup(vi.fn().mockResolvedValue({}), true);
    expect(field).toBeDisabled();
    expect(button).toBeDisabled();

    await userEvent.type(field, "Buy milk{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });
});
