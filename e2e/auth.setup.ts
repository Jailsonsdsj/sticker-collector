import { expect, test as setup } from "@playwright/test";
import { DEV_PASSPHRASE, STORAGE_STATE } from "./helpers";

/**
 * Log in once, for the whole suite.
 *
 * Every test used to sign in for itself, which was fine at three tests and
 * stopped being fine at twelve: `POST /api/auth/login` is rate limited to 10
 * attempts per 15 minutes per IP (architecture.md §4.4), so the suite began
 * failing on its own rate limiter — the limiter working exactly as designed.
 *
 * This still exercises the real thing once: the browser derives the passphrase
 * through 600k PBKDF2 iterations and the Worker verifies it, which is the part
 * worth covering. The tests that follow reuse the session cookie rather than
 * re-proving the same credential a dozen times.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Passphrase").fill(DEV_PASSPHRASE);
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByRole("region", { name: "Wallet" })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
