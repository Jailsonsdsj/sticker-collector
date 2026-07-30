import type { OwnedSticker, Tier } from "@sticker-collector/shared";
import { imageSrc } from "../lib/imageUpload";
import { Badge, Button } from "./ui";

export interface StickerSlotProps {
  sticker: OwnedSticker;
  /** The tier's price in this album. A sticker has no price of its own. */
  price: number;
  /** Buying is impossible until the album itself is unlocked. */
  albumUnlocked: boolean;
  affordable: boolean;
  pending?: boolean;
  onBuy: () => void;
  /** What a spare copy is worth. Only offered when there is a spare. */
  refund?: number;
  onSell?: () => void;
}

/**
 * One slot in the album grid — owned or not.
 *
 * The rarity frame is the bezel **behind** the art, not a border drawn on it.
 * That is what lets an empty slot still announce its tier: with nothing owned,
 * the whole tile is frame. So the user always knows which slot holds the
 * legendary, long before they have it (`prd/05-stickers.md` §Rarity 3).
 *
 * Locked art is the same single colour master under `--filter-locked`. There is
 * never a second, grayscale asset.
 */
export function StickerSlot({
  sticker,
  price,
  albumUnlocked,
  affordable,
  pending,
  onBuy,
  refund,
  onSell,
}: StickerSlotProps) {
  const owned = sticker.quantity > 0;

  return (
    <div className="flex flex-col gap-1">
      <div
        data-tier={sticker.tier}
        data-owned={owned}
        // The slot as a whole is the picture — the frame carries the rarity and
        // the art is decorative inside it. A bare `aria-label` on a div is not
        // exposed at all, which is why the role is not optional here.
        role="img"
        aria-label={`${sticker.tier} slot, ${owned ? "collected" : "empty"}`}
        className="relative overflow-hidden rounded-xl"
        style={{
          // The frame widens with rarity: 4px for a common, 7px for a legendary.
          background: `var(--gradient-frame-${sticker.tier})`,
          padding: `var(--frame-pad-${sticker.tier})`,
          aspectRatio: "var(--aspect-card)",
        }}
      >
        <div className="h-full w-full overflow-hidden rounded-lg bg-surface-2">
          <img
            src={imageSrc(sticker.imageKey)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-[filter] duration-500"
            style={{ filter: owned ? "var(--filter-unlocked)" : "var(--filter-locked-deep)" }}
          />
        </div>

        {/* Duplicates are counted in the upper-left corner (§4). One copy is not
            a duplicate, so the badge stays away until there is something to say. */}
        {sticker.quantity > 1 && (
          <span className="absolute top-1 left-1">
            <Badge tone="coin" variant="solid" size="sm" font="numeric">
              ×{sticker.quantity}
            </Badge>
          </span>
        )}
      </div>

      {/* A duplicate keeps its choice after the reveal has closed. Without this
          the sell action would be reachable for a few seconds per pull, and
          spares would pile up with nowhere to go. */}
      {owned && sticker.quantity > 1 && onSell && (
        <Button
          block
          size="sm"
          variant="ghost"
          tone="coin"
          disabled={pending}
          onClick={onSell}
          aria-label={`Sell a spare ${sticker.tier} for ${refund}`}
        >
          Sell ×{sticker.quantity - 1} · {refund}
        </Button>
      )}

      {!owned && albumUnlocked && (
        <Button
          block
          size="sm"
          variant="outline"
          tone={affordable ? "coin" : "neutral"}
          disabled={!affordable || pending}
          onClick={onBuy}
          aria-label={`Buy ${sticker.tier} sticker for ${price}`}
        >
          {price}
        </Button>
      )}
    </div>
  );
}

/** Tier order, commonest first — the order the legend and any tier filter uses. */
export const TIER_LABEL: Record<Tier, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};
