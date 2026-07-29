import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildAlbumPdf } from "./pdf";

const SP = "/private/tmp/claude-501/-Users-junior-Development-Projects-sticker-collector/dfbb3181-5291-4bf0-99b3-e7121d6d25f3/scratchpad";
const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

it("writes a real pdf", async () => {
  const sticker = new Uint8Array(readFileSync(`${SP}/s.jpg`));
  const cover = new Uint8Array(readFileSync(`${SP}/c.jpg`));
  const tiers = ["common", "rare", "epic", "legendary"] as const;
  const stickers = Array.from({ length: 12 }, (_, i) => ({
    id: `stk${i}`, albumId: "alb1", imageKey: key(i + 1),
    tier: tiers[i % 4], slotIndex: i, quantity: 1,
  }));
  const images = new Map<string, Uint8Array>([[key(999), cover]]);
  for (const s of stickers) images.set(s.imageKey, sticker);

  const bytes = await buildAlbumPdf({
    album: {
      id: "alb1", title: "Kitchen heroes", description: null, coverKey: key(999),
      derivedFromAlbumId: null, unlockPrice: 200, randomPrice: 40,
      prices: { common: 10, rare: 20, epic: 30, legendary: 40 },
      odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
      unlockedAt: "x", completedAt: "2026-07-20T00:00:00Z", sealedAt: "x", createdAt: "x",
      editionNumber: 1, owned: 12, total: 12, percent: 100, status: "completed",
      remaining: 0, almostThere: false, affordable: false,
    } as never,
    stickers: stickers as never,
    images, paper: "a4", today: "2026-07-29",
    readToken: (n) => (readFileSync("src/styles/tokens.css", "utf8").match(new RegExp(`${n}:\\s*(#[0-9a-f]{6})`, "i")) ?? [])[1] ?? "",
  });
  writeFileSync(`${SP}/album.pdf`, bytes);
});
