import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { APP_WIDTH } from "./appWidth";

/**
 * The shell is where the boundary is mounted, and *where* is the whole point:
 * inside the frame, so a crashed screen still has a tab bar to leave by.
 */

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function Boom(): React.ReactElement {
  throw new Error("kaboom");
}

const shell = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<p>Home screen</p>} />
          <Route path="/boom" element={<Boom />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("a crashed screen", () => {
  it("does not take the app down with it", () => {
    shell("/boom");

    expect(screen.getByRole("heading", { name: "This screen broke" })).toBeInTheDocument();
  });

  it("leaves the tab bar standing, so the crash is escapable", async () => {
    // A boundary wrapped *around* the shell would remove the navigation as
    // well, which is the blank screen again with better typography.
    shell("/boom");

    expect(screen.getByRole("link", { name: /albums/i })).toBeInTheDocument();
  });

  it("clears itself when the user navigates away", async () => {
    // The boundary is keyed by pathname. Without that key it stays broken for
    // the rest of the session and every tab leads to the same fallback.
    const user = userEvent.setup();
    shell("/boom");
    expect(screen.getByRole("heading", { name: "This screen broke" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /tasks/i }));

    expect(screen.getByText("Home screen")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "This screen broke" })).not.toBeInTheDocument();
  });

  it("stays out of the way when nothing throws", () => {
    shell("/");

    expect(screen.getByText("Home screen")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the app is one column on a wide screen", () => {
  it("caps the content and centres it", () => {
    // A phone app that happens to open in a desktop browser. Unconstrained it
    // ran to 64rem: album grids eight across, and a wallet on one side of the
    // screen with its balance on the other.
    shell("/");

    const main = document.querySelector("main") as HTMLElement;
    expect(main.className).toContain(APP_WIDTH);
  });

  it("keeps the tab bar's row in that same column", () => {
    shell("/");

    // The bar spans the window — a strip of chrome stopping mid-screen looks
    // like a rendering fault — but the tabs sit in the app's column.
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.className).toContain("inset-x-0");
    expect((nav.firstElementChild as HTMLElement).className).toContain(APP_WIDTH);
  });

  it("uses one class for both, so they cannot drift apart", () => {
    // A tab bar wider than the screen it belongs to looks like a bug in a way
    // that a merely narrow app never does.
    shell("/");

    const main = document.querySelector("main") as HTMLElement;
    const row = screen.getByRole("navigation", { name: "Primary" })
      .firstElementChild as HTMLElement;

    expect(main.className).toContain(APP_WIDTH);
    expect(row.className).toContain(APP_WIDTH);
    // And the width itself lives in CSS, not in a utility spelled out at each
    // site — see appColumnCss.test.ts for the query that gates it.
    expect(main.className).not.toMatch(/max-w-/);
    expect(row.className).not.toMatch(/max-w-/);
  });
});
