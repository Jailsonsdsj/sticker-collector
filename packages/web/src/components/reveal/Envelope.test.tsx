import { render, screen } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Envelope, REVEAL_MS, SHAKE_MS } from "./Envelope";

const key = `img/${"a".repeat(64)}.jpg`;

const renderEnvelope = (props: Partial<Parameters<typeof Envelope>[0]> = {}) => {
  const onOpened = vi.fn();
  const view = render(<Envelope tier="common" imageKey={key} onOpened={onOpened} {...props} />);
  return { onOpened, view };
};

const part = (name: string) => document.querySelector(`[data-part='${name}']`);
/** The clipping root: card → card box → stage → root. */
const root = () => part("card")?.closest("[class*='overflow-hidden']") ?? null;

describe("the reveal always ends with a sticker", () => {
  it("opens even where no motion query matches", () => {
    // jsdom matches neither `no-preference` nor `reduce`. Branching inside
    // gsap.matchMedia would do nothing at all there — and `onOpened` is what
    // reveals the dialog's buttons, so the user would be holding a modal with
    // no way out.
    const { onOpened } = renderEnvelope();
    expect(onOpened).toHaveBeenCalledOnce();
  });

  it("shows the art regardless", () => {
    renderEnvelope();
    expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute(
      "src",
      `/api/images/${key}`,
    );
  });

  it("lays the pack exactly over the card", () => {
    // The pack was `absolute` with no inset, which puts it at its *static*
    // position — wherever flex would have laid it out — so it sat off the card
    // and covered only part of it. Both layers must fill the same stage.
    //
    // Asserted on classes because jsdom has no layout: the browser check is a
    // measurement, and it agreed (256x358 at the same origin for both).
    renderEnvelope();

    for (const name of ["card", "pack"]) {
      const layer = part(name) as HTMLElement;
      expect(layer.className, name).toContain("absolute");
      expect(layer.className, name).toContain("inset-0");
    }
    expect((part("card") as HTMLElement).parentElement).toBe(
      (part("pack") as HTMLElement).parentElement,
    );
  });

  it("does not wear the dialog's own surface", () => {
    // `--gradient-panel-raised` IS the dialog's background, so the pack's body
    // disappeared into it and only the coloured flap read as an envelope — it
    // looked like a lid covering a third of the sticker. Any other surface is
    // fine; that one is not.
    renderEnvelope();

    expect((part("pack") as HTMLElement).style.background).not.toContain("panel-raised");
    expect((part("pack") as HTMLElement).style.background).toBeTruthy();
  });

  it("puts the card in the DOM from the start", () => {
    // A node that appears mid-timeline cannot be animated out of the pack it
    // was supposedly inside.
    renderEnvelope();
    expect(part("card")).not.toBeNull();
    expect(part("pack")).not.toBeNull();
  });
});

describe("how long it takes", () => {
  const withMotion = () =>
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("no-preference"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));

  afterEach(() => vi.unstubAllGlobals());

  it("stretches the whole sequence to the tier's target", () => {
    // The table saying 3000 proves nothing on its own — the timeline has to be
    // scaled to it. Wall-clock length is duration / timeScale.
    withMotion();

    const original = gsap.timeline.bind(gsap);
    let built: gsap.core.Timeline | null = null;
    const spy = vi.spyOn(gsap, "timeline").mockImplementation(((vars?: gsap.TimelineVars) => {
      const timeline = original(vars);
      built = timeline;
      return timeline;
    }) as typeof gsap.timeline);

    renderEnvelope({ tier: "epic" });
    spy.mockRestore();

    expect(built).not.toBeNull();
    const timeline = built as unknown as gsap.core.Timeline;
    expect(timeline.duration() / timeline.timeScale()).toBeCloseTo(REVEAL_MS.epic / 1000, 1);
  });
});

describe("what a tier earns", () => {
  it("gives a common no flourishes at all", () => {
    renderEnvelope({ tier: "common" });
    expect(part("ring")).toBeNull();
    expect(part("bloom")).toBeNull();
  });

  it("gives the flourishes room to be seen around the card", () => {
    // They sit BEHIND the sticker. With the card filling the stage they were
    // drawn and then completely covered — the effect ran where nobody could
    // see it. Measured after: a 262px ring around a 176px card.
    renderEnvelope({ tier: "legendary" });

    const cardBox = (part("card") as HTMLElement).parentElement as HTMLElement;
    const stage = cardBox.parentElement as HTMLElement;

    // The card is boxed smaller than the stage it sits in.
    expect(cardBox.className).toContain("w-48");
    expect(stage.className).toContain("w-80");
    // ...and the ring is wider than that box.
    expect((part("ring") as HTMLElement).className).toContain("size-64");
  });

  it("centres a flourish behind the card, without a transform", () => {
    // Two bugs in one assertion. `absolute` with no inset puts a flourish at
    // the stage's top-left, which is where the ring appeared; and centring it
    // with `-translate-x-1/2` would be overwritten the moment GSAP animated
    // `scale`, putting it back there. Auto margins leave transforms alone.
    renderEnvelope({ tier: "legendary" });

    for (const name of ["ring", "bloom"]) {
      const layer = part(name) as HTMLElement;
      expect(layer.className, name).toContain("inset-0");
      expect(layer.className, name).toContain("m-auto");
      expect(layer.className, name).not.toContain("translate-");
    }
  });

  it("keeps a flourish inside the stage, so nothing scrolls sideways", () => {
    // The ring was 288px inside a 256px stage: it overflowed to the right and
    // the dialog gained a horizontal scrollbar. Measured in the browser after
    // the fix: body and dialog both scroll 0.
    renderEnvelope({ tier: "legendary" });

    expect((part("ring") as HTMLElement).className).toContain("size-64");
    expect(root()?.className).toContain("overflow-hidden");
  });

  it("gives a rare a ring", () => {
    renderEnvelope({ tier: "rare" });
    expect(part("ring")).not.toBeNull();
    expect(part("bloom")).toBeNull();
  });

  it("gives an epic a ring and a bloom", () => {
    renderEnvelope({ tier: "epic" });
    expect(part("ring")).not.toBeNull();
    expect(part("bloom")).not.toBeNull();
  });

  it("gives a legendary everything, including a shine that keeps going", () => {
    // If they all arrived the same way, rarity would be a label rather than a
    // feeling.
    renderEnvelope({ tier: "legendary" });

    expect(part("ring")).not.toBeNull();
    expect(part("bloom")).not.toBeNull();
    expect(part("card")?.className).toContain("animate-legend-glow");
  });

  it("keeps the endless shine off every lesser tier", () => {
    for (const tier of ["common", "rare", "epic"] as const) {
      const { view } = renderEnvelope({ tier });
      expect(part("card")?.className, tier).not.toContain("animate-legend-glow");
      view.unmount();
    }
  });

  it("shakes a rarer pack for longer", () => {
    expect(SHAKE_MS.common).toBeLessThan(SHAKE_MS.legendary);
  });

  it("wears its own tier's frame", () => {
    renderEnvelope({ tier: "epic" });
    expect(part("card")).toHaveAttribute("data-tier", "epic");
  });
});

describe("a duplicate", () => {
  it("says which copy it is", () => {
    renderEnvelope({ quantity: 3 });
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("says nothing on the first copy", () => {
    renderEnvelope({ quantity: 1 });
    expect(screen.queryByText(/^×/)).not.toBeInTheDocument();
  });
});
