import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PullResult } from "@sticker-collector/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS, RevealDialog } from "./RevealDialog";
import { SHAKE_MS } from "./reveal/Envelope";

const key = `img/${"a".repeat(64)}.jpg`;

function pull(over: Partial<PullResult> = {}): PullResult {
  return {
    balance: 960,
    spentCoins: 40,
    albumId: "alb1",
    stickerId: "stk1",
    tier: "common",
    quantity: 1,
    duplicate: false,
    refundIfSold: 20,
    ...over,
  };
}

function renderReveal(
  over: Partial<PullResult> = {},
  props: Partial<Parameters<typeof RevealDialog>[0]> = {},
) {
  const onSell = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <RevealDialog
      pull={pull(over)}
      imageKey={key}
      selling={false}
      onSell={onSell}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSell, onClose, view };
}

const art = () => document.querySelector("img") as HTMLImageElement;
const frame = () => document.querySelector("[data-tier]") as HTMLElement;

describe("a duplicate ends in a choice", () => {
  it("offers to sell the spare, at the price the pull returned", () => {
    // The whole point of the enhancement: a repeat pull is not a dead end.
    renderReveal({ duplicate: true, quantity: 2, refundIfSold: 20 });

    expect(screen.getByRole("button", { name: "Sell for 20" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  });

  it("sells when asked", async () => {
    const { onSell } = renderReveal({ duplicate: true, quantity: 2 });
    await userEvent.click(screen.getByRole("button", { name: /Sell for/ }));
    expect(onSell).toHaveBeenCalledOnce();
  });

  it("keeps when asked, without selling", async () => {
    const { onSell, onClose } = renderReveal({ duplicate: true, quantity: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSell).not.toHaveBeenCalled();
  });

  it("says which copy this is", () => {
    renderReveal({ duplicate: true, quantity: 3 });
    expect(screen.getByText(/copy/)).toBeInTheDocument();
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("stays honest that selling is a loss", () => {
    renderReveal({ duplicate: true, quantity: 2, spentCoins: 40, refundIfSold: 20 });
    expect(screen.getByText(/less than the pull cost/)).toBeInTheDocument();
  });

  it("goes quiet while the sale is in flight", () => {
    renderReveal({ duplicate: true, quantity: 2 }, { selling: true });
    expect(screen.getByRole("button", { name: /Sell for/ })).toBeDisabled();
  });
});

describe("a first copy", () => {
  it("is not for sale", () => {
    // The last copy is the collection; only spares can be sold.
    renderReveal({ duplicate: false, quantity: 1 });
    expect(screen.queryByRole("button", { name: /Sell/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nice" })).toBeInTheDocument();
  });

  it("shows no duplicate count", () => {
    renderReveal({ duplicate: false, quantity: 1 });
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });
});

describe("the reveal itself", () => {
  it("shows the sticker's own art, with no second asset", () => {
    // The card comes out of the pack already in colour: the envelope is the
    // reveal now, where it used to be a grayscale filter lifting.
    renderReveal();
    expect(art().getAttribute("src")).toBe(`/api/images/${key}`);
  });

  it("gives the sticker without the show when motion is unwelcome", () => {
    // jsdom matches neither motion query, which is the same path a reduced-
    // motion setting takes — and the one that must still end with the sticker
    // on screen and the buttons reachable, or the dialog is a trap.
    renderReveal();

    expect(art()).toBeVisible();
    expect(screen.getByRole("button", { name: "Nice" })).toBeInTheDocument();
  });

  it("holds a rarer tier longer", () => {
    // The number a timer uses, not a CSS duration: `SHAKE_MS` is what the
    // envelope's timeline is built from, and it must stay ordered.
    expect(HOLD_MS.common).toBeLessThan(HOLD_MS.rare);
    expect(HOLD_MS.rare).toBeLessThan(HOLD_MS.epic);
    expect(HOLD_MS.epic).toBeLessThan(HOLD_MS.legendary);
  });

  it("wears the tier's own frame", () => {
    renderReveal({ tier: "legendary" });
    expect(frame().style.background).toContain("frame-legendary");
  });

  it("renders nothing at all when there is no pull", () => {
    render(
      <RevealDialog
        pull={null}
        imageKey={null}
        selling={false}
        onSell={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the hold matches the design tokens", () => {
  it("keeps the shake in step with the CSS that names it", () => {
    // A timer cannot read a custom property, so these four numbers are copied
    // by hand, and a copy that drifts makes the choreography disagree with the
    // tokens it was designed from. Note this pins the SHAKE, not the whole
    // reveal: the timeline is stretched to `REVEAL_MS` afterwards.
    // `import.meta.url` is not a file: URL under the test transform, so the
    // tokens are found from the working directory instead.
    const candidates = [
      resolve(process.cwd(), "src/styles/tokens.css"),
      resolve(process.cwd(), "packages/web/src/styles/tokens.css"),
    ];
    const tokensPath = candidates.find((path) => existsSync(path));
    expect(tokensPath, "tokens.css not found").toBeDefined();
    const css = readFileSync(tokensPath as string, "utf8");

    for (const [tier, ms] of Object.entries(SHAKE_MS)) {
      const declared = css.match(new RegExp(`--duration-shake-${tier}:\\s*(\\d+)ms`));
      expect(declared, `--duration-shake-${tier} is missing from tokens.css`).not.toBeNull();
      expect(Number((declared as RegExpMatchArray)[1])).toBe(ms);
    }
  });
});

describe("how long the reveal lasts", () => {
  it("gives a common two seconds", () => {
    // 1.2s was over before the eye had settled on it; 3s turned out to be a
    // wait. Two is long enough to be a beat and short enough to roll again.
    expect(HOLD_MS.common).toBe(2000);
  });

  it("still gives a rarer tier longer", () => {
    expect(HOLD_MS.common).toBeLessThan(HOLD_MS.rare);
    expect(HOLD_MS.rare).toBeLessThan(HOLD_MS.epic);
    expect(HOLD_MS.epic).toBeLessThan(HOLD_MS.legendary);
  });
});

describe("when motion is welcome", () => {
  /** Report that the user wants animation, so the envelope's timeline runs. */
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

  it("keeps the buttons away until the sticker is out", () => {
    // A button to dismiss a reveal that has not happened yet invites skipping
    // the only reward in the app. Unobservable without motion: with it off the
    // envelope opens instantly and the footer is there from the first frame.
    withMotion();
    renderReveal();

    expect(screen.queryByRole("button", { name: "Nice" })).not.toBeInTheDocument();
  });

  it("keeps the envelope in one place, so it cannot play twice", async () => {
    // The reveal used to render bare and then move inside a button once it
    // opened. React unmounts and remounts a component that changes position,
    // and a remounted envelope runs its timeline again — the animation played
    // twice. One button, always, inert until there is something to place.
    withMotion();
    renderReveal();

    const place = screen.getByRole("button", { name: "Place it in the album" });
    expect(place).toBeDisabled();

    await waitFor(() => expect(place).toBeEnabled());
    // The same node throughout: not a second envelope in a new wrapper.
    expect(screen.getByRole("button", { name: "Place it in the album" })).toBe(place);
  });

  it("still holds a duplicate's sell action back too", () => {
    withMotion();
    renderReveal({ duplicate: true, quantity: 2 });

    expect(screen.queryByRole("button", { name: /Sell for/ })).not.toBeInTheDocument();
  });
});
