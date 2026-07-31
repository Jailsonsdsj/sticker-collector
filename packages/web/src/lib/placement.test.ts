import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALBUM_ATTRIBUTE,
  BUY_MS,
  celebrateSticker,
  findSlot,
  placeSticker,
  playUnlock,
  prefersMotion,
  SLOT_ATTRIBUTE,
} from "./placement";

const grid = (ids: string[]) => {
  document.body.innerHTML = ids
    .map((id) => `<div ${SLOT_ATTRIBUTE}="${id}">slot ${id}</div>`)
    .join("");
};

let scrolled: { element: Element; options: ScrollIntoViewOptions }[] = [];

beforeEach(() => {
  scrolled = [];
  // jsdom does not implement scrollIntoView at all.
  Element.prototype.scrollIntoView = function (options?: unknown) {
    scrolled.push({ element: this, options: options as ScrollIntoViewOptions });
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const withMotion = (on: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: on && query.includes("no-preference"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));

describe("finding the slot again", () => {
  it("locates it by sticker id", () => {
    grid(["a", "b", "c"]);
    expect(findSlot("b")?.textContent).toBe("slot b");
  });

  it("returns null when the grid is not showing it", () => {
    // A filter can legitimately be hiding it, which is the caller's business
    // to fix rather than something to throw about.
    grid(["a"]);
    expect(findSlot("zzz")).toBeNull();
  });
});

describe("placing it", () => {
  it("scrolls the slot to the middle of the screen", () => {
    // "nearest" would scroll just far enough to be technically visible; the
    // sticker that just arrived should be the thing you are looking at.
    grid(["a", "b"]);
    placeSticker("b");

    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]?.options.block).toBe("center");
  });

  it("returns the slot it acted on", () => {
    grid(["a"]);
    expect(placeSticker("a")?.textContent).toBe("slot a");
  });

  it("does nothing, and says so, when the slot is absent", () => {
    grid(["a"]);
    expect(placeSticker("nope")).toBeNull();
    expect(scrolled).toHaveLength(0);
  });
});

describe("motion is the enhancement", () => {
  it("glides when motion is welcome", () => {
    withMotion(true);
    grid(["a"]);
    placeSticker("a");

    expect(scrolled[0]?.options.behavior).toBe("smooth");
  });

  it("jumps when it is not", () => {
    // A scroll that never happens is a worse failure than one that happens
    // instantly, so reduced motion still lands on the sticker.
    withMotion(false);
    grid(["a"]);
    placeSticker("a");

    expect(scrolled[0]?.options.behavior).toBe("auto");
    expect(scrolled).toHaveLength(1);
  });

  it("treats a missing matchMedia as no motion", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersMotion()).toBe(false);
  });
});

describe("unlocking an album", () => {
  const shelf = (ids: string[]) => {
    document.body.innerHTML = ids
      .map((id) => `<a ${ALBUM_ATTRIBUTE}="${id}"><span data-part="unlock-ring"></span>${id}</a>`)
      .join("");
  };

  it("acts on the card that was paid for", () => {
    shelf(["a", "b"]);
    expect(playUnlock("b")?.textContent).toContain("b");
  });

  it("says nothing when the card is not on this page", () => {
    // Pagination means the unlocked album may not be in the DOM at all.
    shelf(["a"]);
    expect(playUnlock("zzz")).toBeNull();
  });

  it("still finds the card when motion is unwelcome", () => {
    // The animation is skipped, but the caller should not be told the card is
    // missing — that is a different thing entirely.
    withMotion(false);
    shelf(["a"]);
    expect(playUnlock("a")).not.toBeNull();
  });
});

describe("buying a sticker outright", () => {
  const slotWithParts = (id: string) => {
    document.body.innerHTML = `
      <div ${SLOT_ATTRIBUTE}="${id}">
        <span data-part="buy-ring"></span>
        <span data-part="buy-bloom"></span>
      </div>`;
  };

  it("celebrates in place — no pack, the grid stays on screen", () => {
    // A direct purchase is not a surprise: you chose that one.
    withMotion(true);
    slotWithParts("stk1");

    expect(celebrateSticker("stk1", "legendary")).not.toBeNull();
    expect(scrolled).toHaveLength(0);
  });

  it("says nothing when the slot is not on screen", () => {
    withMotion(true);
    slotWithParts("stk1");
    expect(celebrateSticker("other", "common")).toBeNull();
  });

  it("still resolves the slot when motion is unwelcome", () => {
    // The purchase happened; only the show is skipped.
    withMotion(false);
    slotWithParts("stk1");
    expect(celebrateSticker("stk1", "epic")).not.toBeNull();
  });

  it("lasts two seconds, flourishes and all", () => {
    // The pop and the flourishes used to be separate tweens, which left nothing
    // to stretch — the whole thing was over in about three quarters of a
    // second. One timeline is what makes a target length possible.
    withMotion(true);
    slotWithParts("stk1");

    const original = gsap.timeline.bind(gsap);
    let built: gsap.core.Timeline | null = null;
    const spy = vi.spyOn(gsap, "timeline").mockImplementation(((vars?: gsap.TimelineVars) => {
      const timeline = original(vars);
      built = timeline;
      return timeline;
    }) as typeof gsap.timeline);

    celebrateSticker("stk1", "legendary");
    spy.mockRestore();

    const timeline = built as unknown as gsap.core.Timeline;
    expect(timeline.duration() / timeline.timeScale()).toBeCloseTo(BUY_MS / 1000, 1);
  });

  it("fires the flourishes WITH the pop, not after it", () => {
    // Appending them instead would still last two seconds — timeScale hides
    // that — but the ring would trail the sticker rather than burst from it.
    withMotion(true);
    slotWithParts("stk1");

    const original = gsap.timeline.bind(gsap);
    let built: gsap.core.Timeline | null = null;
    const spy = vi.spyOn(gsap, "timeline").mockImplementation(((vars?: gsap.TimelineVars) => {
      const timeline = original(vars);
      built = timeline;
      return timeline;
    }) as typeof gsap.timeline);

    celebrateSticker("stk1", "legendary");
    spy.mockRestore();

    const ring = document.querySelector("[data-part='buy-ring']");
    const tween = (built as unknown as gsap.core.Timeline)
      .getChildren()
      .find((child) => child.targets().includes(ring));

    expect(tween, "no tween targets the ring").toBeDefined();
    expect((tween as gsap.core.Tween).startTime()).toBe(0);
  });

  it("does not stretch by rarity — there was no suspense to draw out", () => {
    // Which flourishes fire still depends on the tier; how long they take does
    // not. You chose that sticker.
    expect(BUY_MS).toBe(2000);
  });
});
