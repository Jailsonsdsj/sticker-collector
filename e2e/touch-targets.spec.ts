import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Tap targets, measured on a phone-sized viewport.
 *
 * This exists because of a bug that every other kind of test missed. The
 * checkbox hardcoded `w-full` on its visible box, which overrides the width
 * half of `size-7`; with no width on the surrounding label the percentage
 * resolved to the borders alone, and the control on the home screen — the one
 * you press to complete a task, the primary action of the whole app — rendered
 * **4 pixels wide**. It was found on a real iPhone, by hand.
 *
 * Class-level assertions cannot see this: the classes were all present and
 * correct, and only the browser's cascade revealed which one won. So these
 * assertions read geometry.
 */
const IPHONE = { width: 390, height: 844 };

async function size(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  expect(box, "element should be laid out").not.toBeNull();
  return box as { width: number; height: number };
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(IPHONE);
});

test("the home screen's completion control is comfortably tappable", async ({ page }) => {
  await login(page);

  const input = page.getByRole("checkbox", { name: "Read 20 pages", disabled: false });
  const target = await size(input.locator("xpath=.."));

  // 44px is Apple's minimum, and the number the tab bar already follows.
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
});

test("its visible box is a square, not a sliver", async ({ page }) => {
  await login(page);

  const box = await size(
    page.getByRole("checkbox", { name: "Read 20 pages", disabled: false }).locator("xpath=../span"),
  );

  expect(box.width).toBeGreaterThan(20);
  // The regression was 4x28 — a box whose width and height had come apart.
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
});

test("weekly grid cells still stretch to fill their column", async ({ page }) => {
  // The grids are why `w-full` was there at all. Fixing the home screen must
  // not turn their wide cells back into small squares floating in a column.
  await login(page);
  await page.goto("/week");

  const cell = page.getByRole("checkbox").first();
  const label = await size(cell.locator("xpath=.."));
  const visible = await size(cell.locator("xpath=../span"));

  expect(visible.width).toBeCloseTo(label.width, 0);
  expect(visible.width).toBeGreaterThan(visible.height);
});
