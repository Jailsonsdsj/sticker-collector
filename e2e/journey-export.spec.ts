import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { expectImageLoaded, login } from "./helpers";

/**
 * Journey 2: **fill every slot → export the print-ready PDF.**
 *
 * The export is the payoff the whole economy exists to reach, and it is the one
 * feature that fails for reasons nothing else would notice: it reads every
 * sticker's *bytes* out of R2 and embeds them with `pdf-lib`. A missing image
 * is invisible everywhere else in the app — a broken `<img>` still leaves the
 * slot on screen — and fatal here.
 *
 * Setup goes through the API, assertions through the UI. Clicking eleven buy
 * buttons would prove the same thing eleven times; what matters in the browser
 * is the *last* purchase flipping the album to complete, the export panel
 * appearing as a consequence, and a real PDF coming out.
 */
const ALBUM = "album_forest";

interface StickerRow {
  id: string;
  tier: string;
  quantity: number;
}

test("the last sticker completes the album, and the album prints", async ({ page }) => {
  // Logging in through the UI first is what makes the API calls below work:
  // `page.request` shares the browser context's cookies, so the session rides
  // along and no bearer token has to be handled — and, more to the point, the
  // browser's PBKDF2 derivation is not reimplemented here to get one.
  await login(page);

  const detail = async () => {
    const response = await page.request.get(`/api/albums/${ALBUM}`);
    expect(response.ok(), "album detail should be readable").toBeTruthy();
    return (await response.json()) as { album: { status: string }; stickers: StickerRow[] };
  };

  // Unlock if journey 1 has not already. 409 is the API saying it is already
  // unlocked, which is a fine outcome here — this test does not care who did it.
  const unlock = await page.request.post(`/api/albums/${ALBUM}/unlock`);
  expect([201, 409]).toContain(unlock.status());

  // ── Arrange: everything but the last slot ───────────────────────────────
  const missing = (await detail()).stickers.filter((s) => s.quantity === 0);
  expect(missing.length, "the seeded album should have unowned slots").toBeGreaterThan(0);

  for (const sticker of missing.slice(0, -1)) {
    const bought = await page.request.post(`/api/albums/${ALBUM}/stickers/${sticker.id}/buy`);
    expect(bought.status(), `buying ${sticker.id} should succeed`).toBe(201);
  }

  const last = missing[missing.length - 1] as StickerRow;

  // One slot short: the reward is not offered yet. This is the rule that makes
  // it mean anything — a sheet with a hole in it is not the artifact.
  await page.goto(`/albums/${ALBUM}`);
  await expect(page.getByRole("region", { name: "Print export" })).toBeHidden();

  // ── Act: the final purchase, in the browser ─────────────────────────────
  await page
    .getByRole("button", { name: `Buy ${last.tier} sticker for` })
    .first()
    .click();

  const panel = page.getByRole("region", { name: "Print export" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Ready to print")).toBeVisible();
  expect((await detail()).album.status).toBe("completed");

  // Every slot really has art behind it — the thing the export depends on.
  await expectImageLoaded(
    page.getByRole("img", { name: /legendary slot, collected/ }).locator("img"),
  );

  // ── Assert: a real PDF ─────────────────────────────────────────────────
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export PDF" }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);

  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  // Parsed, not sniffed. A file that starts with %PDF- and is 40 bytes long
  // would satisfy every cheaper check.
  const pdf = await PDFDocument.load(new Uint8Array(bytes));

  // A cover plus one sheet per nine stickers: 1 + ceil(12 / 9) = 3.
  expect(pdf.getPageCount()).toBe(3);

  // A4 in points, which is what "prints at true size" rests on. 50×70 mm
  // stickers only come out at 50×70 mm if the page itself is right.
  const [width, height] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
  expect(width).toBeCloseTo(595.28, 1);
  expect(height).toBeCloseTo(841.89, 1);

  // The art is actually in there, and it is the *right* art.
  //
  // Page count and page size say nothing about content: a document with three
  // perfectly sized pages containing the cover twelve times over would satisfy
  // every assertion above. Each embedded JPEG becomes one `/DCTDecode` stream,
  // and `buildAlbumPdf` embeds each distinct key exactly once — so the cover
  // plus twelve distinct stickers is thirteen of them. Anything fewer means
  // slots are sharing a picture they should not share.
  const raw = bytes.toString("latin1");
  expect(raw.match(/\/DCTDecode/g)?.length ?? 0).toBe(13);

  // ...and they are the right *kind* of art. Counting streams alone cannot tell
  // thirteen distinct pictures from the same picture stored thirteen times, so
  // the dimensions do the work: the master sizes are fixed at 1772×2480 for a
  // cover and 591×827 for a sticker (CLAUDE.md), and the upload route rejects
  // anything else. Exactly one cover, exactly twelve stickers.
  expect(raw.match(/\/Width 1772\b/g)?.length ?? 0).toBe(1);
  expect(raw.match(/\/Width 591\b/g)?.length ?? 0).toBe(12);

  await expect(panel.getByText(/^Saved /)).toBeVisible();
});
