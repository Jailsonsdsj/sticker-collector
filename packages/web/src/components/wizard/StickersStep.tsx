import { TIERS } from "@sticker-collector/shared";
import { imageSrc } from "../../lib/imageUpload";
import { StickerGrid } from "../layout";
import { Badge, Button, Checkbox, Chip, Field, ImageTile, Input, Textarea } from "../ui";
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
          label="Add stickers"
          multiple
          onPicked={(imageKey) => dispatch({ type: "addSticker", imageKey })}
        />
        <p className="font-body text-sm text-ink-dim">
          {draft.stickers.length} added. Pick several at once and position them one after another —
          every sticker is cropped to the same 5:7 shape.
        </p>
        {problems.stickers && <p className="font-body text-sm text-magenta">{problems.stickers}</p>}
      </div>

      <Field
        label="Locked slots"
        hint="Optional — keeps the album's surprises until each sticker is earned"
      >
        <div className="flex flex-col gap-3">
          {/* `self-start`, because the checkbox's own label centres its box
              inside a 44px tap target — and a stretched flex item makes that
              target the full width of the column, which parks the box in the
              middle of the form. */}
          <Checkbox
            className="self-start"
            label="Hide locked images"
            checked={draft.hideLocked}
            onChange={(value) => dispatch({ type: "hideLocked", value })}
          />

          {/* Only offered once something is actually hidden. A stand-in for
              slots that are all visible is an image nothing will ever show, and
              the request schema refuses the pair. */}
          {draft.hideLocked && (
            <div className="flex items-center gap-3">
              {draft.lockedCoverKey ? (
                <img
                  src={imageSrc(draft.lockedCoverKey)}
                  alt=""
                  className="w-16 rounded-lg border border-border object-cover"
                  style={{ aspectRatio: "var(--aspect-card)" }}
                />
              ) : (
                // What a locked slot falls back to with no cover chosen.
                <span
                  aria-hidden
                  className="flex w-16 items-center justify-center rounded-lg border border-border border-dashed font-display text-3xl text-ink-faint"
                  style={{ aspectRatio: "var(--aspect-card)" }}
                >
                  ?
                </span>
              )}
              <ImagePicker
                kind="sticker"
                label={draft.lockedCoverKey ? "Replace cover" : "Add locked cover"}
                onPicked={(imageKey) => dispatch({ type: "lockedCover", imageKey })}
              />
            </div>
          )}
        </div>
      </Field>

      <StickerGrid>
        {draft.stickers.map((sticker) => (
          <div key={sticker.imageKey} className="flex flex-col gap-1">
            <div className="relative">
              <div
                className="w-full overflow-hidden rounded-xl border border-border"
                style={{ aspectRatio: "var(--aspect-card)" }}
              >
                <ImageTile src={imageSrc(sticker.imageKey)} className="object-cover" />
              </div>
              <span className="absolute top-1 left-1">
                <Badge tone="neutral" variant="overlay" size="sm">
                  {sticker.tier}
                </Badge>
              </span>
            </div>

            <Input
              id={`sticker-title-${sticker.imageKey}`}
              label="Title"
              hint="optional"
              size="sm"
              value={sticker.title}
              onChange={(e) =>
                dispatch({
                  type: "describeSticker",
                  imageKey: sticker.imageKey,
                  field: "title",
                  value: e.target.value,
                })
              }
            />
            <Textarea
              id={`sticker-description-${sticker.imageKey}`}
              label="Description"
              hint="optional"
              size="sm"
              value={sticker.description}
              onChange={(e) =>
                dispatch({
                  type: "describeSticker",
                  imageKey: sticker.imageKey,
                  field: "description",
                  value: e.target.value,
                })
              }
            />

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
