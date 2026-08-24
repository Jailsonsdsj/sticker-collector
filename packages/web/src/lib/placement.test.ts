import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALBUM_ATTRIBUTE,
  BUY_MS,
  celebrateSticker,
  findSlot,
  GLOW_TONES,
  LAND_MS,
  PIECE_ATTRIBUTE,
  PUZZLE_ATTRIBUTE,
  pickGlowTone,
  placeSticker,
  playPieceLanding,
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

describe("unlocking a thing on the shelf", () => {
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

  it("celebrates a puzzle too, not only an album", () => {
    // Both kinds can now be bought from the shelf. A burst that fired for one
    // and not the other would read as the puzzle's purchase not having landed.
    document.body.innerHTML = `<a ${PUZZLE_ATTRIBUTE}="p1"><span data-part="unlock-ring"></span>p1</a>`;
    expect(playUnlock("p1")?.textContent).toContain("p1");
  });

  it("finds a puzzle card sitting among album cards", () => {
    // One grid, mixed. The selector has to match either attribute on whichever
    // card carries the id.
    document.body.innerHTML = `<a ${ALBUM_ATTRIBUTE}="a1">a1</a><a ${PUZZLE_ATTRIBUTE}="p1">p1</a>`;
    expect(playUnlock("p1")?.textContent).toBe("p1");
    expect(playUnlock("a1")?.textContent).toBe("a1");
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

describe("a random piece landing", () => {
  const board = (indexes: number[]) => {
    document.body.innerHTML = indexes
      .map((i) => `<button ${PIECE_ATTRIBUTE}="${i}">piece ${i}</button>`)
      .join("");
  };

  it("acts on the piece that was pulled, not the first one on screen", () => {
    board([0, 1, 2]);
    expect(playPieceLanding(2)?.textContent).toContain("piece 2");
  });

  it("says nothing when the board is not showing it", () => {
    // The puzzle can legitimately be off screen by the time the request lands.
    board([0]);
    expect(playPieceLanding(99)).toBeNull();
  });

  it("still finds the tile when motion is unwelcome", () => {
    // The animation is skipped; the caller should not be told the piece is
    // missing, which is a different thing entirely.
    withMotion(false);
    board([0]);
    expect(playPieceLanding(0)).not.toBeNull();
  });

  it("animates nothing at all under reduced motion", () => {
    withMotion(false);
    board([0]);
    const before = gsap.globalTimeline.getChildren().length;

    playPieceLanding(0);

    expect(gsap.globalTimeline.getChildren().length).toBe(before);
  });

  it("snaps the piece in and lights it, when motion is welcome", () => {
    withMotion(true);
    board([0]);
    const before = gsap.globalTimeline.getChildren().length;

    playPieceLanding(0);

    // Two: the snap, and the glow. They run together so the piece is readable
    // before the light around it has gone.
    expect(gsap.globalTimeline.getChildren().length).toBeGreaterThan(before);
  });

  it("starts large and lands at its own size, without travelling", () => {
    // A piece that flies in from somewhere else has to be followed. This one
    // grows in its own slot, so it is over the right hole the whole time.
    withMotion(true);
    board([0]);
    const tile = document.querySelector("[data-piece-index='0']") as HTMLElement;

    playPieceLanding(0);

    const transform = tile.style.transform;
    expect(transform).toContain("scale(2.4");
    expect(transform).not.toContain("translate");
    expect(transform).not.toContain("rotate");
  });

  it("never shrinks below its own hole on the way in", () => {
    // A `back` ease overshoots PAST its target, and on a value that is
    // shrinking that means going below it: measured at 0.80 in a real browser,
    // the piece became visibly smaller than its slot and grew back — a squash,
    // not a snap. Scrubbed here rather than watched, so the whole curve is
    // checked rather than whichever frames a timer happened to catch.
    withMotion(true);
    board([0]);
    const tile = document.querySelector("[data-piece-index='0']") as HTMLElement;

    playPieceLanding(0);

    const scaleAt = (time: number) => {
      gsap.globalTimeline.time(time);
      const match = /scale\(([\d.]+)/.exec(tile.style.transform);
      return match ? Number(match[1]) : Number.NaN;
    };

    const samples = Array.from({ length: 24 }, (_, i) => scaleAt((i / 23) * 0.6)).filter((n) =>
      Number.isFinite(n),
    );
    expect(samples.length).toBeGreaterThan(4);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...samples)).toBeLessThanOrEqual(2.4);
  });

  it("lifts it above its neighbours while it is large", () => {
    // At 2.4x a tile still in grid order is half-hidden behind the pieces
    // around it, which reads as growing underneath the board.
    withMotion(true);
    board([0]);
    const tile = document.querySelector("[data-piece-index='0']") as HTMLElement;

    playPieceLanding(0);

    expect(tile.style.zIndex).toBe("30");
  });

  it("keeps the whole sequence inside three seconds", () => {
    // The ceiling the brief set. It is a ceiling, not a target — the piece is
    // in place well before the glow finishes fading.
    expect(LAND_MS).toBeLessThanOrEqual(3000);
  });
});

describe("the colour a landing glows in", () => {
  it("is always one the design system has", () => {
    // Tokens only. A computed colour would fail CI and would put light on
    // screen in a hue the palette does not contain.
    for (let i = 0; i < 40; i++) {
      expect(GLOW_TONES).toContain(pickGlowTone());
    }
  });

  it("is never the one before it", () => {
    // Five colours means a naive draw repeats one pull in five, and two
    // identical flourishes in a row read as the effect having failed to change
    // rather than as chance.
    let previous = pickGlowTone();
    for (let i = 0; i < 60; i++) {
      const next = pickGlowTone();
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it("reaches every colour, rather than alternating between two", () => {
    const seen = new Set(Array.from({ length: 300 }, () => pickGlowTone()));
    expect(seen.size).toBe(GLOW_TONES.length);
  });

  it("paints the tile in the colour it picked, and not the same one twice", () => {
    // Asserting merely that the shadow names *a* token passes just as happily
    // when the colour is hardcoded — which is the thing being replaced. What
    // has to be true is that it changes.
    withMotion(true);
    const shades = new Set<string>();

    for (let i = 0; i < 8; i++) {
      // `board` belongs to the describe above; the markup is one line inline.
      document.body.innerHTML = `<button ${PIECE_ATTRIBUTE}="0">piece</button>`;
      const tile = document.querySelector("[data-piece-index='0']") as HTMLElement;

      playPieceLanding(0);

      const named = /var\(--color-([a-z]+)\)/.exec(tile.style.boxShadow);
      expect(named).not.toBeNull();
      shades.add(named?.[1] as string);
    }

    expect(shades.size).toBeGreaterThan(1);
    for (const shade of shades) expect(GLOW_TONES).toContain(shade);
  });
});
