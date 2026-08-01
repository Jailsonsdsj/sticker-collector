import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { TabBar } from "./TabBar";

/**
 * jsdom has no compositor, so nothing here proves the bar *looks* right. What
 * it holds is the wiring: the right artwork per tab, both states present, and
 * the lit one showing only on the tab you are on.
 */
const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar />
    </MemoryRouter>,
  );

const icon = (name: string) => document.querySelector(`[data-icon="${name}"]`) as HTMLElement;
const lit = (name: string) => !icon(name).className.includes("opacity-0");

describe("the tab bar's icons", () => {
  it("gives every tab its own artwork", () => {
    at("/");

    // The glyphs this replaced used `◈` and `◆` for Albums and Epics — a
    // distinction nobody can make at 16px.
    for (const name of ["tasks", "week", "albums", "epics", "stats"]) {
      expect(icon(`${name}-on`)).toHaveAttribute("src", `/nav/${name}-on.png`);
      expect(icon(`${name}-off`)).toHaveAttribute("src", `/nav/${name}-off.png`);
    }
  });

  it("keeps both states mounted, so a tap does not blink", () => {
    at("/");

    // Swapping a `src` fetches the new image at the moment it is needed. Both
    // are here from the start and cross-fade instead.
    expect(document.querySelectorAll("[data-icon]")).toHaveLength(10);
  });

  it("lights the icon of the tab you are on, and only that one", () => {
    at("/albums");

    expect(lit("albums-on")).toBe(true);
    expect(lit("albums-off")).toBe(false);
    expect(lit("tasks-on")).toBe(false);
    expect(lit("tasks-off")).toBe(true);
  });

  it("stays lit on a tab's descendants, except for Tasks", () => {
    at("/albums/abc");

    // Opening an album does not leave the Albums tab, but every path starts
    // with "/" — which is why only Tasks is end-matched.
    expect(lit("albums-on")).toBe(true);
    expect(lit("tasks-on")).toBe(false);
  });

  it("draws the icons at 28px, not at the old 16px glyph size", () => {
    at("/");

    const frame = icon("tasks-on").parentElement as HTMLElement;
    expect(frame.className).toContain("size-7");
  });
});

describe("the tab bar's labels", () => {
  it("wears the display face the design asks for", () => {
    at("/");

    const tasks = screen.getByRole("link", { name: /tasks/i });
    expect(tasks.className).toContain("font-display");
    expect(tasks.className).toContain("italic");
    expect(tasks.className).toContain("uppercase");
  });

  it("gives Albums and Epics different accents", () => {
    at("/");

    // Two violet tabs side by side is one tab.
    const albums = screen.getByRole("link", { name: /albums/i });
    const epics = screen.getByRole("link", { name: /epics/i });
    expect(albums.style.getPropertyValue("--ui-accent")).toBe("var(--color-magenta)");
    expect(epics.style.getPropertyValue("--ui-accent")).toBe("var(--color-violet)");
  });
});
