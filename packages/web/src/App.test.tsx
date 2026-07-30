import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The screens that sit **outside** `AppShell`, and the fallback React Router
 * ships when you do not supply one.
 *
 * `/login` and `/dev/ui` are routed outside the shell, so the boundary inside
 * it never sees them. That did not leave a blank page — it left something
 * worse. React Router installs a default error boundary on every route and
 * catches the throw before any React boundary mounted above it can, then
 * renders "Unexpected Application Error!", the raw message, and a full stack
 * trace, on screen, to the end user.
 *
 * Login is the sharpest case: someone who cannot get in cannot navigate away
 * either.
 */
vi.mock("./routes/Login", () => ({
  Login: () => {
    throw new Error("kaboom");
  },
}));

/**
 * The shell's own furniture sits *outside* its boundary — the boundary wraps
 * the `<Outlet />`, not the prompt, the tab bar or the update toast. A throw
 * from one of those skips it entirely, which is why the shell route needs an
 * `errorElement` of its own even though every screen under it is covered.
 */
vi.mock("./components/InstallPrompt", () => ({
  InstallPrompt: () => {
    throw new Error("kaboom");
  },
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.history.pushState({}, "", "/login");
});

afterEach(() => {
  window.history.pushState({}, "", "/");
});

const app = async () => {
  const { App } = await import("./App");
  render(<App />);
  return screen.findByRole("heading", { name: "This screen broke" });
};

describe("a crash in the shell itself", () => {
  it("is caught too, though the inner boundary cannot see it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
    );
    window.history.pushState({}, "", "/");
    const { App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "This screen broke" })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe("a crash outside the shell", () => {
  it("shows the app's own fallback, not the router's", async () => {
    expect(await app()).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
  });

  it("never puts a stack trace in front of the user", async () => {
    // The router's default fallback renders one in a <pre>. It is the single
    // most user-hostile thing this app could display.
    await app();

    expect(screen.queryByText(/kaboom/)).not.toBeInTheDocument();
    expect(document.querySelector("pre")).toBeNull();
  });

  it("offers a way out, since there is no tab bar at this level", async () => {
    await app();

    expect(screen.getByRole("link", { name: "Back to tasks" })).toHaveAttribute("href", "/");
  });

  it("still reports the crash, since the console is the only record there is", async () => {
    await app();

    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(logged.some((args) => args[0] === "Route crashed:")).toBe(true);
  });

  it("does not blame the network for a crash", async () => {
    await app();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it("does not offer a retry that would re-render the same crash", async () => {
    // Unlike the in-shell boundary there is no component state to clear, so
    // "try again" would be a button that reliably does nothing.
    await app();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
