import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Where the app's column gets its width.
 *
 * jsdom evaluates no media queries, so a component test can only prove the
 * class is applied — never *when* it bites. This reads the stylesheet instead,
 * because the interesting decision is the query itself: cap the width for a
 * desktop pointer, and for nothing else.
 *
 * The bug this guards against is a tablet being treated as a small desktop. A
 * landscape iPad and a small laptop are the same number of pixels and want
 * opposite things, so any width-based breakpoint here is wrong by
 * construction.
 */
const css = readFileSync(resolve(__dirname, "../src/styles/app.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The block of a `@media` rule whose condition contains `needle`. */
const mediaBlock = (needle: string) => {
  const at = css.indexOf(`@media ${needle}`);
  expect(at, `no @media ${needle} in app.css`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("\n}", css.indexOf("{", at) + 1));
};

const baseRule = () => {
  const at = css.indexOf(".app-column {");
  expect(at, ".app-column is missing from app.css").toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("the app column", () => {
  it("is full width by default, which is what a phone and an iPad want", () => {
    const rule = baseRule();

    expect(rule).toContain("width: 100%");
    // No cap out here: an iPad in either orientation runs the app full screen,
    // and a 512px strip down the middle of a 1024px tablet is a phone
    // emulator, not a layout.
    expect(rule).not.toContain("max-width");
  });

  it("caps the width only for a pointer that can hover", () => {
    const block = mediaBlock("(pointer: fine) and (hover: hover)");

    // The number is pinned so widening the desktop column stays a decision
    // rather than a drift: 64.896rem is the original 32rem, +30%, +20%, +30%.
    // Matched against the SELECTOR, not merely the block: a cap that drifts
    // onto a neighbouring rule leaves the column uncapped while every
    // string in this file still reads correctly.
    expect(block).toMatch(/\.app-column\s*\{[^}]*max-width:\s*64\.896rem/);
    // iPadOS reports a coarse primary pointer even with a keyboard attached,
    // so this query lands on the right side of the tablet/desktop line.
    expect(block).toContain("(pointer: fine)");
    expect(block).toContain("(hover: hover)");
  });

  it("never decides this by screen width", () => {
    // The trap: `min-width: 640px` looks equivalent and quietly puts a
    // landscape iPad in the desktop branch.
    expect(mediaBlock("(pointer: fine) and (hover: hover)")).not.toContain("min-width");
  });

  it("draws the side rules only where there is a cap to rule off", () => {
    // Rules down both sides of a full-width column are two lines drawn on the
    // bezel of the device.
    expect(mediaBlock("(pointer: fine) and (hover: hover)")).toContain(".app-column-framed");
    // ...and nowhere else: every occurrence is inside that query.
    const outside = css
      .replace(mediaBlock("(pointer: fine) and (hover: hover)"), "")
      .includes(".app-column-framed");
    expect(outside).toBe(false);
  });
});
