import { expect, type Locator, type Page } from "@playwright/test";

/** The local-only passphrase baked into `packages/api/seed.sql`. */
export const DEV_PASSPHRASE = "sticker-dev";

/**
 * Sign in for real.
 *
 * No storage-state shortcut and no injected token: the PBKDF2 derivation runs
 * in the browser (600k iterations, because the Worker has a 10 ms CPU budget),
 * and that is exactly the kind of arrangement a smoke test should be proving
 * still works end to end.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Passphrase").fill(DEV_PASSPHRASE);
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByRole("region", { name: "Wallet" })).toBeVisible();
}

/**
 * Ticks a task's box by name, on the only row where that is possible.
 *
 * Two things make this less obvious than it looks. The home screen also lists
 * the fortnight ahead in its Backlog, so several rows share a task's name and
 * only today's is enabled — a future occurrence is not completable and the API
 * 400s on one. And the `<input>` is `sr-only`: the thing a user actually clicks
 * is the styled square, which is the wrapping `<label>`. Clicking the label is
 * therefore the honest gesture, not a workaround.
 */
export async function tick(page: Page, task: string): Promise<void> {
  const box = page.getByRole("checkbox", { name: task, disabled: false });
  await expect(box).toHaveCount(1);
  await box.locator("xpath=..").click();
}

/** The wallet balance as a number — it is rendered with thousands separators. */
export async function balance(page: Page): Promise<number> {
  const wallet = page.getByRole("region", { name: "Wallet" });
  const text = await wallet
    .getByText(/^[\d,.\s]+$/)
    .first()
    .innerText();
  return Number(text.replace(/\D/g, ""));
}

/**
 * Waits for the balance to settle on an exact value.
 *
 * Completing a task does not pay immediately — `UNDO_WINDOW_MS` is five seconds
 * of grace during which the coins are shown as pending and nothing has been
 * written. Polling for the settled figure is what makes the assertion about the
 * *ledger* rather than about the animation.
 */
export async function expectBalance(page: Page, coins: number): Promise<void> {
  await expect
    .poll(() => balance(page), { timeout: 20_000, message: `balance should settle at ${coins}` })
    .toBe(coins);
}

/**
 * Asserts an image is really on screen — decoded, not merely requested.
 *
 * `naturalWidth` is the only honest signal here. A broken `<img>` still has its
 * `src`, still passes a visibility check, and still leaves the sticker slot
 * exactly where it was; it is invisible to every assertion that reads the DOM.
 * Images are content-addressed (`img/<sha256>.jpg`), so this also proves the
 * key matches the bytes: a key that is not the hash of its content is a 404
 * from R2, and a zero-width image here.
 */
export async function expectImageLoaded(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect
    .poll(() => locator.evaluate((img: HTMLImageElement) => img.naturalWidth), {
      timeout: 15_000,
      message: "image should decode, not just be present in the DOM",
    })
    .toBeGreaterThan(0);
}
