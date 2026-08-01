import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ICONS, type AppIconId } from "../src/lib/appIcon";

/**
 * The files behind the picker.
 *
 * `appIcon.ts` builds paths as strings, so every unit test passes whether or
 * not anything is there — and a missing icon is not an error anywhere, it is a
 * blank square where the app's face should be. This walks the public folder
 * instead.
 */
const PUBLIC = resolve(__dirname, "../public");
const SIZES = [32, 180, 192, 512] as const;

const iconDir = (id: AppIconId) => resolve(PUBLIC, "app-icons", id);

describe("every icon ships every size", () => {
  for (const icon of APP_ICONS) {
    it(`${icon.label} has all four`, () => {
      for (const size of SIZES) {
        expect(existsSync(resolve(iconDir(icon.id), `icon-${size}.png`))).toBe(true);
      }
    });
  }
});

describe("every icon ships a manifest that points at itself", () => {
  for (const icon of APP_ICONS) {
    it(`${icon.label}'s manifest names its own files`, () => {
      const path = resolve(iconDir(icon.id), "manifest.webmanifest");
      expect(existsSync(path)).toBe(true);

      const manifest = JSON.parse(readFileSync(path, "utf8"));
      // A manifest copied from another icon is the subtlest way for this to
      // break: the picker looks right, and the installed app wears the wrong
      // face.
      for (const entry of manifest.icons) {
        expect(entry.src).toContain(`/app-icons/${icon.id}/`);
      }
      expect(manifest.icons.map((entry: { sizes: string }) => entry.sizes)).toContain("512x512");
    });
  }

  it("keeps the name, scope and colours of the base manifest", () => {
    const base = JSON.parse(readFileSync(resolve(PUBLIC, "manifest.webmanifest"), "utf8"));
    const one = JSON.parse(readFileSync(resolve(iconDir("coin"), "manifest.webmanifest"), "utf8"));

    // Only the icons may differ. A drifted `start_url` or `display` would turn
    // choosing an icon into changing how the app launches.
    expect({ ...one, icons: undefined }).toEqual({ ...base, icons: undefined });
  });
});
