import { expect, test } from "@playwright/test";
import { login, tick } from "./helpers";

/**
 * The two things a desktop viewport cannot show you: safe-area insets, and a
 * section you have folded away.
 *
 * Insets are zero everywhere except a notched device, so the sheet's padding is
 * asserted by forcing the CSS variables that back `env()` — the value the
 * browser substitutes is what matters, not the number iOS happens to report.
 */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("a sheet's Cancel and Save clear the status bar", async ({ page }) => {
  await login(page);

  // A <dialog> renders in the top layer, outside AppShell — so none of the
  // shell's safe-area padding reaches it. This is the regression.
  await page.getByRole("button", { name: /New task/ }).click();

  const header = page.locator("dialog[open] header");
  await expect(header).toBeVisible();

  // `env(safe-area-inset-top)` is 0 on every non-notched device, so computed
  // geometry reads 20px whether the inset is in the expression or not — a
  // padding assertion alone would pass against the broken version too. The
  // utility class encodes the whole calc, so that is what gets asserted.
  const classes = await header.getAttribute("class");
  expect(classes, "the sheet header must pad for the notch").toContain("safe-area-inset-top");

  // ...and the calc must still resolve, rather than collapsing the way a
  // reference to a token that does not exist would (--space-7 does not exist).
  expect(await header.evaluate((el) => getComputedStyle(el).paddingTop)).toBe("20px");

  // Cancel must sit inside the sheet, below its top edge.
  const cancel = page.locator("dialog[open]").getByRole("button", { name: "Cancel" });
  const [cancelBox, dialogBox] = [
    await cancel.boundingBox(),
    await page.locator("dialog[open]").boundingBox(),
  ];
  expect(cancelBox!.y).toBeGreaterThanOrEqual(dialogBox!.y);
});

test("Cancel is actually legible, not 6% white", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /New task/ }).click();

  const cancel = page.locator("dialog[open]").getByRole("button", { name: "Cancel" });
  const colour = await cancel.evaluate((el) => getComputedStyle(el).color);

  // The bug rendered it as rgba(255,255,255,0.06). Any alpha that low is
  // invisible on this background.
  const alpha = Number(colour.match(/rgba?\([^)]*?,\s*([\d.]+)\)$/)?.[1] ?? "1");
  expect(alpha).toBeGreaterThan(0.5);
  expect(colour).not.toContain("0.06");
});

test("sections open or fold according to what they are for", async ({ page }) => {
  // Work in hand is open; reference is folded. Missed is what already slipped
  // and the backlog is a fortnight that has not happened — either one open
  // pushes today's actual list off the first screenful.
  await login(page);

  await expect(page.getByRole("button", { name: /For today/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("button", { name: /General/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("button", { name: /Missed/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("a section folds away and stays folded", async ({ page }) => {
  await login(page);

  const heading = page.getByRole("button", { name: /General/ });
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  const before = await page.getByRole("checkbox").count();
  expect(before).toBeGreaterThan(0);

  await heading.click();
  await expect(heading).toHaveAttribute("aria-expanded", "false");
  expect(await page.getByRole("checkbox").count()).toBeLessThan(before);

  // Remembered: a toggle that resets on reload is busywork.
  await page.reload();
  await expect(page.getByRole("button", { name: /General/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("unfolding a section that starts closed is remembered too", async ({ page }) => {
  // Storage records only what was toggled, so an override has to work in the
  // opening direction as well — otherwise "closed by default" would be a
  // sentence the user cannot answer back to.
  await login(page);

  const missed = page.getByRole("button", { name: /Missed/ });
  await missed.click();
  await expect(missed).toHaveAttribute("aria-expanded", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: /Missed/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("the effort presets scroll sideways instead of shrinking", async ({ page }) => {
  // Seven presets cannot share one phone-width row without dropping under a
  // comfortable tap target, and wrapping pushes Reward off the first screenful.
  await login(page);
  await page.getByRole("button", { name: /New task/ }).click();

  const strip = page
    .locator("dialog[open]")
    // `exact` matters: "5m" is a substring of "15m".
    .getByRole("button", { name: "5m", exact: true })
    .locator("xpath=..");
  const overflow = await strip.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflow).toBe("auto");

  // Wider than the viewport is what makes it a strip rather than a wrapped grid.
  const { scrollWidth, clientWidth } = await strip.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);

  // Every preset is still a real target, not squeezed to fit.
  for (const label of ["5m", "120m"]) {
    const box = await page
      .locator("dialog[open]")
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    expect(box!.width, label).toBeGreaterThan(30);
  }
});

test("ticking a task moves it into Completed today", async ({ page }) => {
  // The headline of the section rework: a done row leaves the list it was in
  // rather than sitting there dimmed. Only a real render shows this — the
  // sectioning is pure, but the moving is what the user actually sees.
  //
  // The task is created here rather than borrowed from the seed. The suite
  // shares one database and runs in file order, so anything the earlier
  // journeys tick is already in Completed today by the time this runs — an
  // assertion about what that section holds beforehand is really an assertion
  // about the other tests.
  await login(page);

  // A daily ROUTINE, not a quick-add capture. An undated one-off is validated
  // as "completable today only", against `user.timezone` — while the browser
  // computes the date it sends from the *device* zone. When those disagree
  // across midnight the completion is refused (TD-31). A mask covering every
  // weekday is valid on whichever day either clock believes it is, so this
  // test measures the row moving rather than that skew.
  const title = `Move me ${Date.now()}`;
  const created = await page.request.post("/api/tasks", {
    data: { type: "routine", title, effortMinutes: 15, weekdays: 0b1111111 },
  });
  expect(created.status()).toBe(201);
  await page.reload();

  const sectionFor = (name: RegExp) => page.getByRole("button", { name }).locator("xpath=../..");

  // A routine is never scheduled before the day it was created, so a daily one
  // starts today.
  await expect(sectionFor(/For today/).getByText(title)).toBeVisible();

  await tick(page, title);

  await expect(sectionFor(/Completed today/).getByText(title)).toBeVisible();
  // ...and it is no longer offered as work to do.
  await expect(sectionFor(/For today/).getByText(title)).toHaveCount(0);
});
