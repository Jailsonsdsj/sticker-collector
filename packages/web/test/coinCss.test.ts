import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Read from disk, resolved against the project root. `import.meta.url` is an
// http URL under Vite, and a `?raw` import of a stylesheet is intercepted by
// the CSS pipeline — neither gives back the text.
// Comments stripped FIRST. The rule below explains itself in prose that names
// the very declaration being asserted, so searching the raw text passed even
// with the declaration deleted — a test that reads its own documentation.
const css = readFileSync(resolve(__dirname, "../src/styles/app.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/**
 * The coin's CSS, read as text.
 *
 * A component test cannot catch what this catches: jsdom has no layout, so
 * `Coin` rendered "correctly" in every unit test while painting **nothing** in
 * a real browser. The faces are `<span>` children sized at `height: 100%`, and
 * a percentage height has nothing to resolve against inside an *inline* box —
 * they came out 0x0 while the coin still laid out at the right size, which is
 * the most misleading shape a bug can take.
 *
 * So this asserts the two declarations that make the assembly a box at all.
 * Crude, but it fails the moment someone tidies them away.
 */
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from app.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
};

describe("the coin has a box to paint into", () => {
  it("gives the body a block box", () => {
    expect(rule(".coin-body")).toContain("display: block");
  });

  it("keeps the 3D space the faces and the edge live in", () => {
    // Without `preserve-3d` the edge and the reverse are flattened onto the
    // front and the spin becomes a squash.
    expect(rule(".coin-body")).toContain("transform-style: preserve-3d");
    expect(rule(".coin")).toContain("perspective");
  });

  it("positions the faces against that box", () => {
    const face = rule(".coin-face");
    expect(face).toContain("position: absolute");
    expect(face).toContain("inset: 0");
  });
});
