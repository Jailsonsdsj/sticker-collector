import type { OwnedSticker, Tier } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StickerSlot } from "./StickerSlot";

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

function sticker(over: Partial<OwnedSticker> = {}): OwnedSticker {
  return {
    id: "stk1",
    albumId: "alb1",
    imageKey: key(1),
    title: null,
    description: null,
    tier: "common",
    slotIndex: 0,
    quantity: 0,
    ...over,
  };
}

function renderSlot(
  over: Partial<OwnedSticker> = {},
  props: Partial<Parameters<typeof StickerSlot>[0]> = {},
) {
  const onBuy = vi.fn();
  const view = render(
    <StickerSlot
      sticker={sticker(over)}
      price={20}
      albumUnlocked
      affordable
      onBuy={onBuy}
      {...props}
    />,
  );
  return { onBuy, view };
}

const frame = () => document.querySelector("[data-tier]") as HTMLElement;
const art = () => document.querySelector("img") as HTMLImageElement;

describe("the rarity reads on an empty slot", () => {
  it("tells a legendary slot from a common one before either is owned", () => {
    // The claim this task exists for: the user always knows which slot holds
    // the legendary, locked or not. It used to be the bezel; it is now the
    // envelope, which prints the tier across the top.
    renderSlot({ tier: "common", quantity: 0 });
    const common = art().getAttribute("src");

    render(
      <StickerSlot
        sticker={sticker({ id: "stk2", tier: "legendary", quantity: 0 })}
        price={400}
        albumUnlocked
        affordable
        onBuy={vi.fn()}
      />,
    );
    // Scoped to the slot: the buy button carries a coin, which is also an
    // <img> and is also last in the document.
    const legendary = (
      [...document.querySelectorAll("[data-tier]")].at(-1) as HTMLElement
    ).querySelector("img") as HTMLImageElement;

    expect(common).toBe("/envelopes/common.png");
    expect(legendary.getAttribute("src")).toBe("/envelopes/legendary.png");
  });

  it("gives every tier its own envelope", () => {
    const envelopes = new Set<string>();

    for (const tier of ["common", "rare", "epic", "legendary"] as Tier[]) {
      const { view } = renderSlot({ tier, quantity: 0 });
      envelopes.add(art().getAttribute("src") ?? "");
      view.unmount();
    }

    expect(envelopes.size).toBe(4);
  });

  it("keeps the bezel for a slot that is not sealed", () => {
    // An owned sticker still wears its rarity frame; only the sealed pack
    // skips it, because the artwork draws its own.
    const { view } = renderSlot({ tier: "epic", quantity: 1 });
    expect(frame().style.background).toContain("frame-epic");
    view.unmount();

    renderSlot({ tier: "epic", quantity: 0 });
    expect(frame().style.background).toBe("");
  });

  it("keeps the frame once the sticker is owned", () => {
    // Rarity is a permanent property of the slot, not a hint that disappears.
    renderSlot({ tier: "epic", quantity: 1 });
    expect(frame().style.background).toContain("frame-epic");
  });

  it("announces its tier and whether it is filled", () => {
    // Queried by role, not just by label: an `aria-label` on an element with no
    // role is not exposed to assistive tech at all, and a label query alone
    // would pass anyway.
    renderSlot({ tier: "legendary", quantity: 0 });
    expect(screen.getByRole("img", { name: "legendary slot, sealed" })).toBeInTheDocument();
  });

  it("announces a collected slot differently", () => {
    renderSlot({ tier: "rare", quantity: 2 });
    expect(screen.getByRole("img", { name: "rare slot, collected" })).toBeInTheDocument();
  });
});

describe("colour and grey", () => {
  it("seals an unowned sticker in its tier's envelope, and never fetches the art", () => {
    // Stronger than the greyscale preview this replaced: the answer is not in
    // the network tab either, because the sticker's own image is never asked
    // for while the slot is sealed.
    renderSlot({ quantity: 0 });

    expect(art().getAttribute("src")).toBe("/envelopes/common.png");
    expect(art().getAttribute("src")).not.toContain(key(1));
  });

  it("shows an owned sticker in colour, from the same source", () => {
    renderSlot({ quantity: 1 });
    expect(art().style.filter).toBe("var(--filter-unlocked)");
    expect(art().getAttribute("src")).toBe(`/api/images/${key(1)}`);
  });
});

describe("duplicates", () => {
  it("counts copies past the first", () => {
    renderSlot({ quantity: 3 });
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("says nothing when there is only one", () => {
    renderSlot({ quantity: 1 });
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it("says nothing about an empty slot", () => {
    renderSlot({ quantity: 0 });
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });
});

describe("buying from the slot", () => {
  it("offers the tier's price in this album", async () => {
    const { onBuy } = renderSlot({ quantity: 0 }, { price: 120 });

    const button = screen.getByRole("button", { name: /Buy common sticker for 120/ });
    expect(button).toHaveTextContent("120");

    await userEvent.click(button);
    expect(onBuy).toHaveBeenCalledOnce();
  });

  it("offers nothing inside a locked album", () => {
    // No sticker may be bought until the album itself is unlocked.
    renderSlot({ quantity: 0 }, { albumUnlocked: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers nothing for a sticker already owned", () => {
    renderSlot({ quantity: 1 });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("refuses a purchase the balance cannot cover", () => {
    renderSlot({ quantity: 0 }, { affordable: false });
    expect(screen.getByRole("button", { name: /Buy/ })).toBeDisabled();
  });

  it("goes quiet while a purchase is in flight", () => {
    renderSlot({ quantity: 0 }, { pending: true });
    expect(screen.getByRole("button", { name: /Buy/ })).toBeDisabled();
  });
});

describe("an album that hides its locked slots", () => {
  const cover = key(77);
  const hiding = { hideLocked: true, lockedCoverKey: cover };

  const imageOf = (name: RegExp) =>
    screen.getByRole("img", { name }).querySelector("img") as HTMLImageElement | null;

  it("shows the album's stand-in instead of the sticker's own art", () => {
    // Not a filtered copy of the art: the sticker's image is never requested,
    // so the answer cannot be read out of the network tab either.
    renderSlot({ quantity: 0 }, hiding);

    expect(imageOf(/hidden/)?.getAttribute("src")).toContain(cover);
    expect(imageOf(/hidden/)?.getAttribute("src")).not.toContain(key(1));
  });

  it("falls back to the envelope when the author supplied no stand-in", () => {
    // It used to be a bare "?". The envelope says the same thing and says the
    // tier while it is at it.
    renderSlot({ quantity: 0, tier: "epic" }, { hideLocked: true, lockedCoverKey: null });

    expect(imageOf(/sealed/)?.getAttribute("src")).toBe("/envelopes/epic.png");
  });

  it("still announces the tier — that is what a locked slot is for", () => {
    renderSlot({ quantity: 0, tier: "legendary" }, hiding);

    expect(screen.getByRole("img", { name: "legendary slot, hidden" })).toBeInTheDocument();
  });

  it("still says where the legendary is", () => {
    renderSlot({ quantity: 0, tier: "legendary" }, { hideLocked: true, lockedCoverKey: null });

    // The bezel is gone from a sealed slot — the envelope draws its own — but
    // the tier must still be legible in the grid, from the artwork and from
    // the DOM.
    expect(screen.getByRole("img", { name: /sealed/ })).toHaveAttribute("data-tier", "legendary");
    expect(imageOf(/sealed/)?.getAttribute("src")).toBe("/envelopes/legendary.png");
  });

  it("shows the real art the moment the sticker is owned", () => {
    renderSlot({ quantity: 1 }, hiding);

    expect(imageOf(/collected/)?.getAttribute("src")).toContain(key(1));
    expect(imageOf(/collected/)?.getAttribute("src")).not.toContain(cover);
  });

  it("does not gray the stand-in — it is shown as itself", () => {
    // The author picked that picture *because* it reads as a hidden slot;
    // dimming it would undo the choice.
    renderSlot({ quantity: 0 }, hiding);

    expect(imageOf(/hidden/)?.getAttribute("style")).toContain("var(--filter-unlocked)");
  });

  it("seals a locked slot even in an album that hides nothing", () => {
    // `hideLocked` used to be the difference between a greyed preview and a
    // stand-in. With envelopes every locked slot is sealed, and the setting
    // only decides whether the album's own stand-in replaces the pack.
    renderSlot({ quantity: 0 });

    expect(imageOf(/sealed/)?.getAttribute("src")).toBe("/envelopes/common.png");
  });
});

describe("a slot is a picture, not prose", () => {
  it("refuses the context menu on the whole slot", () => {
    // Not only the <img>: a control-click or long press anywhere on the tile
    // would otherwise raise a menu over a tap target.
    renderSlot({ quantity: 0 });

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("img", { name: /sealed/ }).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("cannot be selected or long-pressed into a callout", () => {
    renderSlot({ quantity: 0 });

    const slot = screen.getByRole("img", { name: /sealed/ });
    expect(slot.className).toContain("select-none");
    expect(slot.className).toContain("[-webkit-touch-callout:none]");
  });
});

describe("the envelope is shown as itself", () => {
  it("is never dimmed — it is the finished picture of a locked slot", () => {
    // Dimming it would be dimming the design: the pack already reads as
    // locked, tab, badge and all.
    renderSlot({ quantity: 0 });

    const style = screen.getByRole("img", { name: /sealed/ }).querySelector("img")?.style;
    expect(style?.filter).toBe("var(--filter-unlocked)");
  });

  it("gives way to the real art the moment it is owned", () => {
    renderSlot({ quantity: 1 });

    const art = screen.getByRole("img", { name: /collected/ }).querySelector("img");
    expect(art?.getAttribute("src")).toContain(key(1));
    expect(art?.style.filter).toBe("var(--filter-unlocked)");
  });

  it("lets an authored stand-in outrank the generic pack", () => {
    // A stand-in is a decision about *this* album; the envelope is the
    // fallback for every album that made no such decision.
    renderSlot({ quantity: 0 }, { hideLocked: true, lockedCoverKey: key(77) });

    const art = screen.getByRole("img", { name: /hidden/ }).querySelector("img");
    expect(art?.getAttribute("src")).toContain(key(77));
    expect(art?.style.filter).toBe("var(--filter-unlocked)");
  });
});

describe("the price says what it costs in", () => {
  it("carries a coin beside the number", () => {
    renderSlot({ quantity: 0 }, { albumUnlocked: true, affordable: true });

    // The coin is the object, not a glyph: a bare number on a button is a
    // number, and the button has to say what it costs in.
    expect(screen.getByRole("button", { name: /Buy/ }).querySelector(".coin")).not.toBeNull();
  });
});

describe("what a slot brings to a purchase", () => {
  it("carries no flourish nodes for a common", () => {
    // A grid is mostly commons; dead nodes in every one of them is a cost paid
    // on every render for an effect that never fires.
    renderSlot({ tier: "common" });

    expect(document.querySelector("[data-part='buy-ring']")).toBeNull();
    expect(document.querySelector("[data-part='buy-bloom']")).toBeNull();
  });

  it("carries a ring for a rare", () => {
    renderSlot({ tier: "rare" });

    expect(document.querySelector("[data-part='buy-ring']")).not.toBeNull();
    expect(document.querySelector("[data-part='buy-bloom']")).toBeNull();
  });

  it("carries both for a legendary", () => {
    renderSlot({ tier: "legendary" });

    expect(document.querySelector("[data-part='buy-ring']")).not.toBeNull();
    expect(document.querySelector("[data-part='buy-bloom']")).not.toBeNull();
  });

  it("keeps them invisible until something plays them", () => {
    renderSlot({ tier: "legendary" });

    expect(document.querySelector("[data-part='buy-ring']")?.className).toContain("opacity-0");
  });
});
