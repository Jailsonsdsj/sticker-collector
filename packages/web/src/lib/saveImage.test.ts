import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveImageError, saveSticker } from "./saveImage";

const KEY = `img/${"1".padStart(64, "0")}.jpg`;

const ok = () =>
  vi.fn(async () => new Response(new Blob(["bytes"], { type: "image/jpeg" }), { status: 200 }));

let click: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("fetch", ok());
  // jsdom has neither, and both are the point of this module.
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  click.mockRestore();
});

describe("saving a sticker", () => {
  it("shares the file when the browser can, which is the only way onto an iOS camera roll", async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share });

    await saveSticker(KEY, "Red Fox");

    const shared = share.mock.calls[0]?.[0];
    expect(shared?.title).toBe("Red Fox");
    expect(shared?.files?.[0]?.name).toBe("red-fox.jpg");
    // No second attempt: a download after a successful share saves it twice.
    expect(click).not.toHaveBeenCalled();
  });

  it("treats a dismissed share sheet as a decision, not a failure", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    vi.stubGlobal("navigator", { canShare: () => true, share });

    await saveSticker(KEY, "Red Fox");

    // Downloading anyway would save the file they just declined to save.
    expect(click).not.toHaveBeenCalled();
  });

  it("falls back to a download when sharing is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    await saveSticker(KEY, "Grey Wolf");

    expect(click).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("downloads when the browser shares but cannot share FILES", async () => {
    // A browser can have `navigator.share` and still refuse files (desktop
    // Safari, older Android). Calling it anyway throws a TypeError at the user.
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal("navigator", { canShare: () => false, share });

    await saveSticker(KEY, "Red Fox");

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it("falls back to a download when the share itself breaks", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: async () => {
        throw new Error("no handler");
      },
    });

    await saveSticker(KEY, null);

    expect(click).toHaveBeenCalled();
  });

  it("names an untitled sticker something rather than nothing", async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share });

    await saveSticker(KEY, null);

    expect(share.mock.calls[0]?.[0]?.files?.[0]?.name).toBe("sticker.jpg");
  });

  it("throws something sayable when the image cannot be fetched", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );

    await expect(saveSticker(KEY, "Red Fox")).rejects.toBeInstanceOf(SaveImageError);
    expect(click).not.toHaveBeenCalled();
  });
});
