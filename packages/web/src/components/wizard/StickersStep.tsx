import { TIERS } from "@sticker-collector/shared";
import { imageSrc } from "../../lib/imageUpload";
import { StickerGrid } from "../layout";
import { Badge, Button, Chip } from "../ui";
import type { StepProps } from "./DetailsStep";
import { ImagePicker } from "./ImagePicker";

/**
 * The sticker set and its rarities.
 *
 * Tier is assigned here and frozen by the seal, and it decides two things
 * forever: what the sticker costs, and its odds in a pull. Both are properties
 * of *this album*, which is why the tier sits on the sticker rather than on the
 * picture.
 */
export function StickersStep({ draft, problems, dispatch }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <ImagePicker
          kind="sticker"
          label="Add sticker"
          onPicked={(imageKey) => dispatch({ type: "addSticker", imageKey })}
        />
        <p className="font-body text-sm text-ink-dim">
          {draft.stickers.length} added. Every sticker is cropped to the same 5:7 shape.
        </p>
        {problems.stickers && <p className="font-body text-sm text-magenta">{problems.stickers}</p>}
      </div>

      <StickerGrid>
        {draft.stickers.map((sticker) => (
          <div key={sticker.imageKey} className="flex flex-col gap-1">
            <div className="relative">
              <img
                src={imageSrc(sticker.imageKey)}
                alt=""
                className="w-full rounded-xl border border-border object-cover"
                style={{ aspectRatio: "var(--aspect-card)" }}
              />
              <span className="absolute top-1 left-1">
                <Badge tone="neutral" variant="overlay" size="sm">
                  {sticker.tier}
                </Badge>
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {TIERS.map((tier) => (
                <Chip
                  key={tier}
                  size="sm"
                  fill="tint"
                  font="body"
                  selected={sticker.tier === tier}
                  onClick={() => dispatch({ type: "retier", imageKey: sticker.imageKey, tier })}
                  aria-label={`${tier} tier`}
                >
                  {tier.slice(0, 1).toUpperCase()}
                </Chip>
              ))}
            </div>

            <Button
              variant="ghost"
              tone="magenta"
              size="sm"
              onClick={() => dispatch({ type: "removeSticker", imageKey: sticker.imageKey })}
            >
              Remove
            </Button>
          </div>
        ))}
      </StickerGrid>
    </div>
  );
}
