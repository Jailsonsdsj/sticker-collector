import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_ICONS,
  appIconSrc,
  applyAppIcon,
  DEFAULT_APP_ICON,
  loadAppIcon,
  saveAppIcon,
} from "./appIcon";

beforeEach(() => localStorage.clear());

describe("remembering the choice", () => {
  it("starts on the default", () => {
    expect(loadAppIcon()).toBe(DEFAULT_APP_ICON);
  });

  it("keeps what was chosen", () => {
    saveAppIcon("coin");
    expect(loadAppIcon()).toBe("coin");
  });

  it("ignores a value that is not one of the icons", () => {
    // A stale key from an older build, or someone editing storage by hand. A
    // bad id would resolve to /app-icons/<junk>/icon-180.png — a broken image
    // where the app's face should be.
    localStorage.setItem("sc_app_icon", "dragon");
    expect(loadAppIcon()).toBe(DEFAULT_APP_ICON);
  });
});

describe("pointing the document at the chosen set", () => {
  const links = () => {
    document.head.innerHTML = `
      <link rel="apple-touch-icon" href="/icons/icon-180.png" />
      <link rel="icon" href="/icons/icon-32.png" />
      <link rel="manifest" href="/manifest.webmanifest" />`;
    return () => ({
      apple: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? "",
      icon: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? "",
      manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "",
      count: document.querySelectorAll('link[rel="apple-touch-icon"]').length,
    });
  };

  it("moves all three links, including the manifest", () => {
    const read = links();

    applyAppIcon("sticker-pink");

    const after = read();
    // iOS reads apple-touch-icon; the manifest carries the 192/512 that an
    // Android or desktop install uses. Moving one and not the other installs a
    // different icon depending on the platform.
    expect(after.apple).toContain("/app-icons/sticker-pink/icon-180.png");
    expect(after.icon).toContain("/app-icons/sticker-pink/icon-32.png");
    expect(after.manifest).toContain("/app-icons/sticker-pink/manifest.webmanifest");
  });

  it("rewrites the existing link rather than adding another", () => {
    const read = links();

    applyAppIcon("coin");
    applyAppIcon("star");

    // A second apple-touch-icon does not override the first — iOS picks
    // whichever it likes, which is a coin flip dressed up as a preference.
    expect(read().count).toBe(1);
    expect(read().apple).toContain("/app-icons/star/");
  });

  it("does not throw in a document that has no icon links", () => {
    document.head.innerHTML = "";
    expect(() => applyAppIcon("coin")).not.toThrow();
  });
});

describe("the sets themselves", () => {
  it("addresses every size under the icon's own folder", () => {
    for (const icon of APP_ICONS) {
      for (const size of [32, 180, 192, 512] as const) {
        expect(appIconSrc(icon.id, size)).toBe(`/app-icons/${icon.id}/icon-${size}.png`);
      }
    }
  });
});
