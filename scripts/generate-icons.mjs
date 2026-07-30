#!/usr/bin/env node
/**
 * Draws the PWA icon set and the iOS launch images.
 *
 * These are **placeholders**, and they are code rather than committed binaries
 * on purpose: a reviewer can see exactly what they are, they redraw identically
 * on any machine, and replacing them with real artwork means dropping in PNGs
 * without touching anything else (see TD-22).
 *
 * Everything is drawn from the design tokens, so the launch flash matches the
 * app instead of a stock white. No dependencies — a PNG is a handful of chunks
 * and a zlib stream, and pulling in an image library to draw a rounded square
 * would be worse.
 *
 *   node scripts/generate-icons.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(ROOT, "packages/web/public");

/** From styles/tokens.css — --color-void, --color-coin, --color-lime. */
const VOID = [0x0c, 0x0a, 0x13];
const COIN = [0xff, 0xcc, 0x33];
const LIME = [0xb6, 0xff, 0x3d];

/** The mark: a coin disc with a lime slice, centred. Simple, and legible at 32px. */
function drawIcon(size, { padding = 0.18 } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const outer = (size / 2) * (1 - padding);
  const inner = outer * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);

      let colour = VOID;
      if (distance <= outer) colour = COIN;
      // A lime wedge, so the mark is not a plain circle at a glance.
      if (distance <= outer && dx > 0 && dy < 0 && distance > inner) colour = LIME;
      if (distance <= inner) colour = VOID;

      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

/** A launch image: the flat background with the mark small and centred. */
function drawSplash(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  const mark = Math.round(Math.min(width, height) * 0.28);
  const icon = drawIcon(mark, { padding: 0 });
  const offsetX = Math.round((width - mark) / 2);
  const offsetY = Math.round((height - mark) / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      pixels[at] = VOID[0];
      pixels[at + 1] = VOID[1];
      pixels[at + 2] = VOID[2];
      pixels[at + 3] = 255;
    }
  }

  for (let y = 0; y < mark; y++) {
    for (let x = 0; x < mark; x++) {
      const from = (y * mark + x) * 4;
      // The mark's own background is the page background, so skip it and keep
      // the splash flat behind the disc.
      const isBackground =
        icon[from] === VOID[0] && icon[from + 1] === VOID[1] && icon[from + 2] === VOID[2];
      if (isBackground) continue;

      const to = ((offsetY + y) * width + (offsetX + x)) * 4;
      icon.copy(pixels, to, from, from + 4);
    }
  }
  return pixels;
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** RGBA pixels → a PNG. Filter byte 0 per scanline, then one deflate stream. */
function png(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function write(path, buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  console.log(`  ${path.replace(`${ROOT}/`, "")}  ${buffer.length} bytes`);
}

console.log("icons");
for (const size of [32, 180, 192, 512]) {
  write(resolve(WEB, `icons/icon-${size}.png`), png(size, size, drawIcon(size)));
}
// Maskable needs its safe zone: everything important inside the middle 80%.
write(resolve(WEB, "icons/maskable-512.png"), png(512, 512, drawIcon(512, { padding: 0.3 })));

console.log("splash");
/**
 * The current iPhone families. A complete set is about twenty device-specific
 * images; these cover the phones in use now, and `background_color` keeps the
 * rest from flashing white (TD-22).
 */
const SPLASHES = [
  [1290, 2796, "iphone-15-pro-max"],
  [1179, 2556, "iphone-15-pro"],
  [1170, 2532, "iphone-14"],
  [1125, 2436, "iphone-x"],
  [828, 1792, "iphone-11"],
];
for (const [width, height, name] of SPLASHES) {
  write(resolve(WEB, `splash/${name}.png`), png(width, height, drawSplash(width, height)));
}
