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
 * Locked art is the same single colour master under `--filter-locked-deep`.
 * There is never a second, grayscale asset.
 *
 * **Only an album that hides its locked slots seals them.** That album's slots
 * show the tier's envelope — its own frame, its rarity tab, the word LOCKED —
 * and the sticker's own image is never requested, which is what keeps the
 * answer out of the network tab. An album that hides nothing keeps showing the
 * art you have not earned yet, drained of colour: that is what the option is
 * choosing between, and what the reveal floods back in.
 *
 * Within a hiding album an authored stand-in still wins over the pack: the
 * cover is a picture the author chose for this album, stored once and reused
 * for every hidden slot.
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
  // The envelope belongs to albums that asked to keep their surprises. An
  // album that hides nothing still shows its own art in black and white — that
  // is the point of not hiding. Within a hiding album, an authored stand-in
  // outranks the generic pack: it is a decision about *this* album.
  const sealed = hidden && !lockedCoverKey;
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
      aria-label={`${sticker.tier} slot, ${
        owned ? "collected" : sealed ? "sealed" : hidden ? "hidden" : "empty"
      }`}
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
          className="object-cover transition-[filter] duration-500"
          style={{
            // Grey is for a slot showing its OWN art: the sticker you have not
            // earned yet, drained of colour, which is what the reveal floods
            // back in. An envelope and an authored stand-in are both finished
            // pictures of a locked slot, and dimming either would be dimming
            // the design.
            filter: owned || hidden ? "var(--filter-unlocked)" : "var(--filter-locked-deep)",
            // Locked art sits further back than the filter alone puts it, so a
            // collected sticker is the thing the eye lands on.
            opacity: owned || hidden ? 1 : 0.45,
          }}
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
