import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PullResult, Tier } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HOLD_MS, RevealDialog } from "./RevealDialog";

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
  it("floods the art from grey to colour, without a second asset", () => {
    renderReveal();
    expect(art().className).toContain("animate-reveal-flood");
    expect(art().getAttribute("src")).toBe(`/api/images/${key}`);
  });

  it("only animates when motion is welcome", () => {
    // A reduced-motion setting should still get the sticker, just not the show.
    renderReveal();
    expect(art().className).toContain("motion-safe:");
  });

  it("holds a rarer tier longer", () => {
    const seen = new Map<Tier, string>();
    for (const tier of ["common", "rare", "epic", "legendary"] as Tier[]) {
      const { view } = renderReveal({ tier });
      seen.set(tier, frame().style.animationDuration);
      view.unmount();
    }

    expect(new Set(seen.values()).size).toBe(4);
    expect(seen.get("legendary")).not.toBe(seen.get("common"));
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
  it("waits exactly as long as the CSS says the reveal lasts", () => {
    // A timer cannot read a custom property, so these four numbers are copied
    // by hand — and a copy that drifts makes the actions appear before or after
    // the reveal has landed. This reads the tokens and checks them.
    // `import.meta.url` is not a file: URL under the test transform, so the
    // tokens are found from the working directory instead.
    const candidates = [
      resolve(process.cwd(), "src/styles/tokens.css"),
      resolve(process.cwd(), "packages/web/src/styles/tokens.css"),
    ];
    const tokensPath = candidates.find((path) => existsSync(path));
    expect(tokensPath, "tokens.css not found").toBeDefined();
    const css = readFileSync(tokensPath as string, "utf8");

    for (const [tier, ms] of Object.entries(HOLD_MS)) {
      const declared = css.match(new RegExp(`--duration-shake-${tier}:\\s*(\\d+)ms`));
      expect(declared, `--duration-shake-${tier} is missing from tokens.css`).not.toBeNull();
      expect(Number((declared as RegExpMatchArray)[1])).toBe(ms);
    }
  });
});
