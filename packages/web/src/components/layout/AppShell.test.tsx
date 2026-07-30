import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

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
