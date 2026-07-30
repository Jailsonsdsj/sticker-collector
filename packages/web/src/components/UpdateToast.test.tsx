import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SwHandlers } from "../lib/serviceWorker";
import { UpdateToast } from "./UpdateToast";

/**
 * Offering an update rather than imposing one.
 *
 * The real registration talks to a service worker, which jsdom does not have, so
 * it is injected. What is tested is the promise this component makes: the
 * running version keeps working until the user says otherwise.
 */

/** A registration that never reports an update — the ordinary case. */
const quiet = vi.fn(async () => undefined);

/** A registration that reports one immediately, handing back its activator. */
function ready(activate = vi.fn(async () => undefined)) {
  const register = vi.fn(async (handlers: SwHandlers) => {
    handlers.onUpdateReady(activate);
  });
  return { register, activate };
}

describe("when there is nothing to update", () => {
  it("shows nothing at all", async () => {
    render(<UpdateToast register={quiet} />);
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  });
});

describe("when a new version is waiting", () => {
  it("says so", async () => {
    const { register } = ready();
    render(<UpdateToast register={register} />);

    expect(await screen.findByText("A new version is ready")).toBeInTheDocument();
  });

  it("reloads only when asked", async () => {
    // A worker that activates by itself can reload mid-tap, mid-form, mid-crop.
    const { register, activate } = ready();
    render(<UpdateToast register={register} />);

    await screen.findByText("A new version is ready");
    expect(activate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(activate).toHaveBeenCalledOnce();
  });

  it("can be dismissed, and stays dismissed", async () => {
    const { register, activate } = ready();
    render(<UpdateToast register={register} />);
    await screen.findByText("A new version is ready");

    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByText("A new version is ready")).not.toBeInTheDocument();
    expect(activate).not.toHaveBeenCalled();
  });

  it("says the pending work is safe either way", async () => {
    const { register } = ready();
    render(<UpdateToast register={register} />);
    expect(await screen.findByText(/nothing is lost/i)).toBeInTheDocument();
  });
});

describe("registration itself", () => {
  it("happens once, not on every render", async () => {
    const { register } = ready();
    const { rerender } = render(<UpdateToast register={register} />);
    rerender(<UpdateToast register={register} />);
    rerender(<UpdateToast register={register} />);

    expect(register).toHaveBeenCalledOnce();
  });
});
