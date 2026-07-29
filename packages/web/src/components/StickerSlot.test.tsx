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

describe("the rarity frame reads on an empty slot", () => {
  it("tells a legendary slot from a common one before either is owned", () => {
    // The claim this task exists for: the user always knows which slot holds the
    // legendary, locked or not. Nothing here is owned and no art is loaded.
    renderSlot({ tier: "common", quantity: 0 });
    const common = { bg: frame().style.background, pad: frame().style.padding };

    render(
      <StickerSlot
        sticker={sticker({ id: "stk2", tier: "legendary", quantity: 0 })}
        price={400}
        albumUnlocked
        affordable
        onBuy={vi.fn()}
      />,
    );
    const legendary = [...document.querySelectorAll("[data-tier]")].at(-1) as HTMLElement;

    expect(legendary.style.background).not.toBe(common.bg);
    expect(legendary.style.padding).not.toBe(common.pad);
  });

  it("gives every tier its own frame", () => {
    const backgrounds = new Set<string>();
    const paddings = new Set<string>();

    for (const tier of ["common", "rare", "epic", "legendary"] as Tier[]) {
      const { view } = renderSlot({ tier });
      backgrounds.add(frame().style.background);
      paddings.add(frame().style.padding);
      view.unmount();
    }

    expect(backgrounds.size).toBe(4);
    expect(paddings.size).toBe(4);
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
    expect(screen.getByRole("img", { name: "legendary slot, empty" })).toBeInTheDocument();
  });

  it("announces a collected slot differently", () => {
    renderSlot({ tier: "rare", quantity: 2 });
    expect(screen.getByRole("img", { name: "rare slot, collected" })).toBeInTheDocument();
  });
});

describe("colour and grey", () => {
  it("greys an unowned sticker with a filter over the one master", () => {
    renderSlot({ quantity: 0 });
    expect(art().style.filter).toContain("filter-locked");
    expect(art().getAttribute("src")).toBe(`/api/images/${key(1)}`);
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
