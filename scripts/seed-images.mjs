/**
 * seed-images.mjs — put real JPEGs in the local R2 bucket and point the seed
 * rows at them.
 *
 * `seed.sql` shipped with placeholder keys (`img/seed-forest-00.jpg`) and said
 * so in its own header. Nothing noticed, because a missing `<img>` still leaves
 * a sticker slot on screen — but the print export reads every sticker's *bytes*
 * and embeds them with `pdf-lib`, so a placeholder key is a failed export. The
 * end-to-end journey is the first thing that actually needs these to exist.
 *
 * Two rules from CLAUDE.md shape this file:
 *   - keys are content-addressed, `img/<sha256>.jpg` — so the key is derived
 *     from the bytes here exactly as the browser derives it, never invented;
 *   - masters are JPEG at exactly 591×827 (sticker) or 1772×2480 (cover), which
 *     is what `PUT /api/images/*` enforces. The seed honours the same sizes, so
 *     seeded art and uploaded art are indistinguishable downstream.
 *
 * Output is SQL on stdout, applied after `seed.sql`. Deriving the keys and the
 * SQL in one pass is what keeps the bucket and the database from ever
 * disagreeing — there are no hashes written down anywhere to go stale.
 *
 * The **sticker rows are inserted here, not in `seed.sql`**, and that is not a
 * stylistic choice: `sticker_frozen` aborts every UPDATE on the table, so a
 * sticker's `image_key` has exactly one chance to be correct. Since the key is
 * the hash of bytes that do not exist until this script runs, the row cannot be
 * written any earlier. The trigger is right and the seed was wrong.
 *
 * `album.cover_key` is different — `album_sealed_frozen` guards only the
 * economics — so the cover is an UPDATE on the row `seed.sql` already wrote.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { encode } from "jpeg-js";

// Miniflare is what `wrangler dev` runs, so writing through it produces exactly
// the state the Worker will read. It is resolved via wrangler rather than
// depended on directly: pinning a second copy is how the two drift apart.
const require = createRequire(import.meta.resolve("wrangler"));
const { Miniflare } = require("miniflare");

const BUCKET = "sticker-collector-images";
const PERSIST = ".wrangler/state/v3";

/** The dimensions `imageKindForSize` accepts. Wrong ones are rejected on PUT. */
const STICKER = { width: 591, height: 827 };
const COVER = { width: 1772, height: 2480 };

/**
 * A flat colour block per sticker, deterministic in the slot index.
 *
 * Deterministic matters: the key is the hash of the bytes, so a stable image
 * means a stable key, and re-seeding does not churn the bucket. Distinct
 * colours matter too — a smoke test that asserts a sticker was revealed wants
 * twelve visibly different images, not twelve identical grey rectangles.
 */
function paint({ width, height }, hue) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      // A gradient rather than a flat fill: JPEG is a frequency codec, and a
      // single flat colour compresses to almost nothing, which is not a
      // realistic master to exercise the export with.
      data[i] = (hue * 37 + x * 0.3) % 256;
      data[i + 1] = (hue * 89 + y * 0.2) % 256;
      data[i + 2] = (hue * 151 + (x + y) * 0.1) % 256;
      data[i + 3] = 255;
    }
  }
  return Buffer.from(encode({ data, width, height }, 82).data);
}

/** 6 common / 3 rare / 2 epic / 1 legendary, by slot — the mix seed.sql had. */
const TIERS = [
  "common",
  "common",
  "common",
  "common",
  "common",
  "common",
  "rare",
  "rare",
  "rare",
  "epic",
  "epic",
  "legendary",
];

const keyFor = (bytes) => `img/${createHash("sha256").update(bytes).digest("hex")}.jpg`;

const mf = new Miniflare({
  script: "export default {};",
  modules: true,
  r2Buckets: { IMAGES: BUCKET },
  defaultPersistRoot: PERSIST,
});

try {
  const bucket = await mf.getR2Bucket("IMAGES");
  const statements = [];

  const put = async (bytes) => {
    const key = keyFor(bytes);
    // `head` first, exactly like the upload route: identical bytes are stored
    // once, which is the property that makes a derived edition cost nothing.
    if (!(await bucket.head(key))) {
      await bucket.put(key, bytes, {
        httpMetadata: {
          contentType: "image/jpeg",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
    }
    return key;
  };

  const cover = await put(paint(COVER, 7));
  statements.push(`UPDATE album SET cover_key = '${cover}' WHERE id = 'album_forest';`);

  const rows = [];
  for (let slot = 0; slot < 12; slot += 1) {
    const key = await put(paint(STICKER, slot + 1));
    const id = `stk_forest_${String(slot).padStart(2, "0")}`;
    rows.push(`  ('${id}', 'album_forest', '${key}', '${TIERS[slot]}', ${slot})`);
  }
  statements.push(
    `INSERT INTO sticker (id, album_id, image_key, tier, slot_index) VALUES\n${rows.join(",\n")};`,
  );

  process.stdout.write(`${statements.join("\n")}\n`);
} finally {
  await mf.dispose();
}
