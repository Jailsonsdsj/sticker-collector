import { zeroOddsWarnings } from "../../lib/albumDraft";
import { EconomyPreview } from "../EconomyPreview";
import { Badge } from "../ui";
import type { StepProps } from "./DetailsStep";

/**
 * The last look before everything becomes permanent.
 *
 * Sealing freezes the sticker set, every price, every rarity, the odds and the
 * slot order. The seal is a commitment device, not a security boundary — the
 * album can always be superseded or deleted, at a cost — but nothing here can
 * be edited afterwards, so the warnings belong on this side of the button.
 */
export function SealStep({ draft, problems }: StepProps) {
  const zeroOdds = zeroOddsWarnings(draft);
  const blockers = Object.values(problems).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <p className="font-body text-sm text-ink-secondary">
        Sealing fixes the sticker set, the prices, the rarities, the drop odds and the slot order.
        None of it can be edited afterwards.
      </p>

      {blockers.length > 0 && (
        <div className="rounded-2xl border border-magenta bg-panel p-3">
          <p className="mb-1 font-body text-sm font-bold text-magenta">Not ready to seal</p>
          <ul className="list-inside list-disc font-body text-sm text-ink-secondary">
            {blockers.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {zeroOdds.length > 0 && (
        <div className="rounded-2xl border border-border bg-panel p-3">
          <p className="mb-1 font-body text-sm font-bold text-ink">
            Some stickers can only be bought directly
          </p>
          <p className="font-body text-sm text-ink-secondary">
            These tiers hold stickers but roll at 0%, so a random pull can never return them. That
            is allowed — just make sure you meant it.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {zeroOdds.map((tier) => (
              <Badge key={tier} tone="magenta" variant="tint" size="sm">
                {tier}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <EconomyPreview draft={draft} />
    </div>
  );
}
