import { expect, test } from "@playwright/test";
import { balance, expectBalance, expectImageLoaded, login, tick } from "./helpers";

/**
 * Journey 1: **complete a task → earn coins → unlock an album → buy a sticker.**
 *
 * This is the loop the entire product is. Every piece of it is unit-tested
 * somewhere, but nothing until now has checked that a coin earned by ticking a
 * box is the same coin the album accepts — across the browser, the Worker, D1's
 * conditional-spend SQL, and the append-only ledger.
 *
 * The assertions are on **exact balances**, never on "it went down". Money is
 * integer coins, and an off-by-one in the spend path is precisely the bug a
 * smoke test is worth having.
 */
test.describe.configure({ mode: "serial" });

test("a completed task pays, and the coins unlock an album and buy a sticker", async ({ page }) => {
  await login(page);

  const opening = await balance(page);
  expect(opening).toBeGreaterThanOrEqual(210); // seeded history: 200 unlock + 10 sticker

  // ── Earn ────────────────────────────────────────────────────────────────
  // "Read 20 pages" carries weekday mask 127, so it is scheduled every day and
  // this test does not depend on which day CI happens to run.
  await tick(page, "Read 20 pages");

  // The five-second undo window has to elapse before anything is written; the
  // wallet shows the coins as pending in the meantime.
  await expectBalance(page, opening + 30);

  // ── Unlock ──────────────────────────────────────────────────────────────
  await page.getByRole("link", { name: /collection/i }).click();

  // The shelf opens on Collecting, which shows what is on the go and what is
  // finished — not what is still shut. Forest Friends is locked until three
  // lines from now, so this journey has to say which shelf it means.
  //
  // All, not Locked. On Locked the card would vanish the instant it is
  // unlocked, which makes the `Unlock 200` assertion below pass for the wrong
  // reason and leaves nothing to click through to the album.
  await page.getByRole("tab", { name: "All" }).click();

  // The cover really renders. Nothing else in this journey would notice if the
  // art were missing — a broken <img> leaves the card intact — and the images
  // are the half of a sticker album that cannot be regenerated.
  await expectImageLoaded(page.getByRole("link", { name: /Forest Friends/ }).locator("img"));
  await page.getByRole("button", { name: "Unlock 200" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/This costs/)).toBeVisible();
  await dialog.getByRole("button", { name: "Spend 200" }).click();

  await expect(page.getByRole("button", { name: "Unlock 200" })).toBeHidden();

  // ── Buy ─────────────────────────────────────────────────────────────────
  await page.getByRole("link", { name: /Forest Friends/ }).click();

  const buy = page.getByRole("button", { name: "Buy common sticker for 10" }).first();
  await buy.click();

  // One more slot is filled. The art is a CSS grayscale filter over a single
  // colour master, so "collected" is the only honest thing to assert here.
  const collected = page.getByRole("img", { name: "common slot, collected" }).first();
  await expect(collected).toBeVisible();
  await expectImageLoaded(collected.locator("img"));

  await page.getByRole("link", { name: /tasks/i }).click();
  await expectBalance(page, opening + 30 - 200 - 10);
});

test("the ledger is the balance: a reload cannot change it", async ({ page }) => {
  // The wallet is SUM(ledger), never a column and never cached. A figure that
  // survives a full reload is a figure that came from the database.
  await login(page);
  const settled = await balance(page);

  await page.reload();
  await expect(page.getByRole("region", { name: "Wallet" })).toBeVisible();

  expect(await balance(page)).toBe(settled);
});
