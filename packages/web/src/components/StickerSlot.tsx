import type { OwnedSticker, Tier } from "@sticker-collector/shared";
import { imageSrc } from "../lib/imageUpload";
import { envelopeSrc, FLOURISH } from "../lib/rarity";
import { Badge, Button, Coin, ImageTile } from "./ui";

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
  /**
   * The album hides what has not been collected.
   *
   * An unowned slot then shows the album's stand-in rather than its own art
   * under a filter, so the surprise survives until the sticker is earned.
   */
  hideLocked?: boolean;
  /** One stand-in for every locked slot. Null falls back to a "?". */
  lockedCoverKey?: string | null;
  /**
   * Open this sticker full size. Offered for collected stickers only — a
   * locked one has nothing to show.
   */
  onOpen?: () => void;
}

/**
 * One slot in the album grid — owned or not.
 *
 * The rarity frame is the bezel **behind** the art, not a border drawn on it.
 * That is what lets an empty slot still announce its tier: with nothing owned,
 * the whole tile is frame. So the user always knows which slot holds the
 * legendary, long before they have it (`prd/05-stickers.md` §Rarity 3).
 *
 * **An unowned slot is a sealed pack**, not a greyed-out preview: the tier's
 * envelope, which carries its own frame, its rarity tab and the word LOCKED.
 * Every locked sticker therefore keeps its surprise, and the reveal opens the
 * very pack the grid has been showing.
 *
 * That replaces the old black-and-white preview, which showed the art you had
 * not earned yet — a trade the design made deliberately (`prd/05-stickers.md`).
 * The sticker's own art is not requested at all while it is sealed, which is
 * what keeps the answer out of the network tab.
 *
 * An album that supplies its own stand-in still wins: that is an explicit
 * authoring choice about *this* album, and it outranks the generic pack.
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
  hideLocked = false,
  lockedCoverKey = null,
  onOpen,
}: StickerSlotProps) {
  const owned = sticker.quantity > 0;
  const hidden = !owned && Boolean(hideLocked);
  // Sealed unless the album author supplied a stand-in for hidden slots, which
  // is a decision about this album and outranks the generic pack.
  const sealed = !owned && !(hidden && lockedCoverKey);
  const openable = owned && Boolean(onOpen);
  const flourish = FLOURISH[sticker.tier];

  // A real button, not a click handler on the tile: the viewer is the only way
  // to read a sticker's description, and a div cannot be reached with a
  // keyboard. The tile keeps its `role="img"` inside it, so the slot is still
  // announced as the picture it is.
  const tile = (
    <div
      data-tier={sticker.tier}
      data-owned={owned}
      // How a freshly pulled sticker is found again after the grid re-renders,
      // so the album can scroll to where it landed.
      data-sticker-id={sticker.id}
      // The slot as a whole is the picture — the frame carries the rarity and
      // the art is decorative inside it. A bare `aria-label` on a div is not
      // exposed at all, which is why the role is not optional here.
      role="img"
      // The tier is still announced while hidden — that is what a locked slot
      // is *for* — but nothing identifies the sticker itself.
      aria-label={`${sticker.tier} slot, ${owned ? "collected" : sealed ? "sealed" : "hidden"}`}
      // A slot is a picture, not prose: a long press or a control-click
      // should not start selecting it, and neither should raise a menu over
      // a tap target.
      onContextMenu={(event) => event.preventDefault()}
      className="relative touch-manipulation overflow-hidden rounded-xl select-none [-webkit-touch-callout:none]"
      style={{
        // The frame widens with rarity: 4px for a common, 7px for a legendary.
        // A sealed slot skips it — the envelope is drawn with its own bezel,
        // and two frames around one card reads as a mistake.
        background: sealed ? undefined : `var(--gradient-frame-${sticker.tier})`,
        padding: sealed ? undefined : `var(--frame-pad-${sticker.tier})`,
        aspectRatio: "var(--aspect-card)",
      }}
    >
      {/* Dormant until a purchase plays them. Rendered only for the tiers that
          earn them, so a grid of commons carries no dead nodes. */}
      {flourish.ring && (
        <span
          data-part="buy-ring"
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-4/5 rounded-full border-2 opacity-0"
          style={{ borderColor: `var(--color-rarity-${sticker.tier}-ring)` }}
        />
      )}
      {flourish.bloom && (
        <span
          data-part="buy-bloom"
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-2/3 rounded-full opacity-0 blur-lg"
          style={{ background: `var(--color-rarity-${sticker.tier})` }}
        />
      )}

      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2">
        <ImageTile
          src={
            sealed
              ? envelopeSrc(sticker.tier)
              : imageSrc(hidden ? (lockedCoverKey as string) : sticker.imageKey)
          }
          className="object-cover"
          // The envelope is already the finished picture of a locked slot —
          // its own frame, its own rarity tab, its own LOCKED badge. Dimming
          // it would be dimming the design.
          style={{ filter: "var(--filter-unlocked)" }}
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
  );

  return (
    <div className="flex flex-col gap-1">
      {openable ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`View ${sticker.title ?? `${sticker.tier} sticker`}`}
          className="block cursor-pointer rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          {tile}
        </button>
      ) : (
        tile
      )}

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
          <Coin size="xs" />
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
