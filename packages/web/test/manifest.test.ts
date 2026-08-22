import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The manifest and the assets it promises.
 *
 * These are checkable facts. What is *not* checkable here is the row's actual
 * criterion — "installs to an iPhone home screen and launches standalone" needs
 * a phone. What this rules out is the common reason installs fail silently: a
 * manifest that names icons which are missing, or whose real pixel size does
 * not match the `sizes` it declares.
 */
const root = (() => {
  const candidates = [process.cwd(), resolve(process.cwd(), "packages/web")];
  return candidates.find((dir) => existsSync(resolve(dir, "index.html"))) as string;
})();

const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/** Width and height straight out of the PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(resolve(root, path));
  expect([...bytes.subarray(0, 4)], `${path} is not a PNG`).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};

const html = read("index.html");
const tokens = read("src/styles/tokens.css");

describe("the manifest", () => {
  it("asks to launch without browser chrome", () => {
    // Anything other than standalone (or fullscreen) opens in a tab, which is
    // the whole thing this task exists to avoid.
    expect(manifest.display).toBe("standalone");
  });

  it("starts at the root, and scopes the whole app", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("names itself for the home screen and the launcher", () => {
    expect(manifest.name).toBe("Sticker Collector");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("paints the launch flash in the app's own background, not white", () => {
    const voidColour = tokens.match(/--color-void:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(voidColour).toBeTruthy();
    expect(manifest.background_color.toLowerCase()).toBe(voidColour?.toLowerCase());
    expect(manifest.theme_color.toLowerCase()).toBe(voidColour?.toLowerCase());
  });

  it("offers the two sizes an installer needs, plus a maskable one", () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("names only icons that exist, at the size they claim", () => {
    // A manifest that lies about a size is the classic silent install failure.
    for (const icon of manifest.icons) {
      const path = `public${icon.src}`;
      expect(existsSync(resolve(root, path)), icon.src).toBe(true);

      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngSize(path), icon.src).toEqual({ width, height });
    }
  });
});

describe("what iOS reads instead of the manifest", () => {
  it("links the manifest at all", () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain("/manifest.webmanifest");
  });

  it("asks for a standalone launch, which iOS takes from the meta tag", () => {
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it("points the home screen icon at a real 180px file", () => {
    const href = html.match(/rel="apple-touch-icon"\s+href="([^"]+)"/)?.[1];
    expect(href).toBeTruthy();
    expect(pngSize(`public${href}`)).toEqual({ width: 180, height: 180 });
  });

  it("names every launch image it promises", () => {
    const hrefs = [...html.matchAll(/rel="apple-touch-startup-image"\s+href="([^"]+)"/g)].map(
      (match) => match[1] as string,
    );
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      expect(existsSync(resolve(root, `public${href}`)), href).toBe(true);
    }
  });

  it("pairs every launch image with a media query, or iOS ignores it", () => {
    const links = [...html.matchAll(/<link[^>]*apple-touch-startup-image[^>]*>/g)].map(
      (match) => match[0],
    );
    for (const link of links) {
      expect(link, link).toContain("media=");
      expect(link, link).toContain("device-width");
    }
  });
});

describe("the viewport", () => {
  const viewport = html.match(/<meta[^>]*name="viewport"[^>]*>/s)?.[0] ?? "";
  const content = viewport.match(/content="([^"]+)"/s)?.[1]?.replace(/\s+/g, " ") ?? "";

  it("turns pinch zoom off, so the app does not slide under a stray gesture", () => {
    expect(content).toContain("maximum-scale=1.0");
    expect(content).toContain("user-scalable=no");
  });

  it("still opts into the safe area", () => {
    // The regression this guards: `viewport-fit=cover` is what makes
    // env(safe-area-inset-*) non-zero on iOS, and it lives in the same string
    // as the zoom flags. Editing one is how the other silently disappears and
    // the tab bar ends up under the home indicator.
    expect(content).toContain("viewport-fit=cover");
    expect(content).toContain("width=device-width");
  });
});
