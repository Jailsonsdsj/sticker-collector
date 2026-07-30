import { TIERS } from "@sticker-collector/shared";
import { EconomyPreview } from "../EconomyPreview";
import { Button, Input } from "../ui";
import type { StepProps } from "./DetailsStep";

/**
 * The ten numbers, and what they mean.
 *
 * The preview sits beside the fields rather than behind a "check" button,
 * because the point is to notice an incoherent economy *while* writing it —
 * once the album is sealed none of this can be changed.
 */
export function EconomyStep({ draft, problems, dispatch }: StepProps) {
  const number = (value: string) => Number.parseInt(value, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Input
          id="album-unlock-price"
          label="Unlock price"
          tone="coin"
          inputMode="numeric"
          value={String(draft.unlockPrice)}
          onChange={(e) =>
            dispatch({ type: "price", field: "unlockPrice", value: number(e.target.value) })
          }
        />
        <Input
          id="album-random-price"
          label="Random sticker"
          tone="coin"
          inputMode="numeric"
          value={String(draft.randomPrice)}
          error={problems.randomPrice}
          onChange={(e) =>
            dispatch({ type: "price", field: "randomPrice", value: number(e.target.value) })
          }
        />
      </div>

      <div>
        <p className="mb-2 font-body text-2xs tracking-kicker text-ink-muted uppercase">
          Price per tier
        </p>
        <div className="grid grid-cols-4 gap-2">
          {TIERS.map((tier) => (
            <Input
              key={tier}
              id={`album-price-${tier}`}
              label={tier}
              size="sm"
              tone="coin"
              inputMode="numeric"
              value={String(draft.prices[tier])}
              onChange={(e) => dispatch({ type: "tierPrice", tier, value: number(e.target.value) })}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">
            Drop odds (%)
          </p>
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            onClick={() => dispatch({ type: "resetOdds" })}
          >
            Reset to 60 / 25 / 12 / 3
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {TIERS.map((tier) => (
            <Input
              key={tier}
              id={`album-odds-${tier}`}
              label={`${tier} odds`}
              size="sm"
              tone="numeric"
              inputMode="numeric"
              value={String(draft.odds[tier])}
              onChange={(e) => dispatch({ type: "odds", tier, value: number(e.target.value) })}
            />
          ))}
        </div>
        {problems.odds && <p className="mt-1 font-body text-sm text-magenta">{problems.odds}</p>}
      </div>

      <EconomyPreview draft={draft} />
    </div>
  );
}
