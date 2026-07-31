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

test("settings is an icon in the wallet, and still big enough to hit", async ({ page }) => {
  // It moved out of the header and into the wallet's corner, above the hours
  // line. An icon is smaller than the words it replaced, so the 44px rule
  // matters more here than it did before, not less.
  await login(page);

  const gear = page.getByRole("link", { name: "Settings" });
  const wallet = page.getByRole("region", { name: "Wallet" });

  await expect(wallet.getByRole("link", { name: "Settings" })).toBeVisible();

  const target = await size(gear);
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);

  // An icon with no accessible name is a mystery button; this is the only
  // thing telling a screen reader what the glyph means.
  await gear.click();
  await page.waitForURL("**/settings");
});

test("double-tap zoom is off, and the viewport says so", async ({ page }) => {
  // `touch-action: manipulation` is the half iOS honours in Safari as well as
  // in the installed app — the viewport flags below only bind once installed.
  await login(page);

  const touchAction = await page.evaluate(
    () => getComputedStyle(document.documentElement).touchAction,
  );
  expect(touchAction).toBe("manipulation");

  const viewport = await page.evaluate(
    () => document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
  );
  expect(viewport).toContain("user-scalable=no");
  // Shipped together, so they are asserted together: dropping viewport-fit
  // silently zeroes every safe-area inset.
  expect(viewport).toContain("viewport-fit=cover");
});
