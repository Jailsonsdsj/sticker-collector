import {
  coinsToHours,
  effectiveWeights,
  expectedRandomValue,
  TIERS,
} from "@sticker-collector/shared";
import { type AlbumDraft, draftCost, tierCounts, zeroOddsWarnings } from "../lib/albumDraft";
import { Badge } from "./ui";

export interface EconomyPreviewProps {
  draft: AlbumDraft;
}

/**
 * What the user has just written, in their own terms.
 *
 * An album is a contract of ten numbers, and this is the only place the
 * consequences of those numbers are visible before the seal makes them
 * permanent (`prd/04-albums.md` §The album economy).
 *
 * **Nothing here blocks sealing.** These figures exist so an incoherent economy
 * is not created *by accident* — a pull that costs more than it returns, an
 * album priced at three hundred hours — not to overrule someone who meant it.
 */
export function EconomyPreview({ draft }: EconomyPreviewProps) {
  const cost = draftCost(draft);
  const { hours, minutes } = coinsToHours(cost);

  // The EV uses the **effective** odds, not the declared ones: after the seal a
  // tier with no stickers can never be pulled, so counting its price would
  // advertise a payout that cannot happen.
  const counts = tierCounts(draft);
  const weights = effectiveWeights(draft.odds, counts);
  const expected = expectedRandomValue(draft.prices, weights);
  const pullIsALoss = expected < draft.randomPrice;

  const emptyOdds = zeroOddsWarnings(draft);

  return (
    <section
      aria-label="Economy preview"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-panel p-4"
    >
      <div>
        <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">
          Total album cost
        </p>
        <p className="font-numeric text-2xl font-bold text-coin">
          {cost.toLocaleString()} <span className="text-base text-ink-dim">coins</span>
        </p>
        {/* One coin is one minute, so the same number in hours is what the album
            actually asks of the user. */}
        <p className="font-body text-sm text-ink-secondary">
          about{" "}
          <span className="font-numeric font-bold text-ink">{hoursLabel(hours, minutes)}</span> of
          work
        </p>
      </div>

      <div className="border-border border-t pt-3">
        <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">
          A random sticker
        </p>
        <p className="font-body text-sm text-ink-secondary">
          costs <span className="font-numeric font-bold text-coin">{draft.randomPrice}</span>, and
          on average is worth <span className="font-numeric font-bold text-ink">{expected}</span>
        </p>
        {pullIsALoss && (
          <p className="mt-1 font-body text-sm text-ink-dim">
            A pull returns less than it costs. That may be exactly what you want — it is what makes
            duplicates sting.
          </p>
        )}
      </div>

      {emptyOdds.length > 0 && (
        <div className="border-border border-t pt-3">
          <p className="font-body text-sm text-ink-secondary">
            These tiers can never be pulled — their stickers can only be bought directly:
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {emptyOdds.map((tier) => (
              <Badge key={tier} tone="magenta" variant="tint" size="sm">
                {tier}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <dl className="grid grid-cols-4 gap-2 border-border border-t pt-3">
        {TIERS.map((tier) => (
          <div key={tier}>
            <dt className="font-body text-3xs text-ink-muted capitalize">{tier}</dt>
            <dd className="font-numeric text-sm text-ink">
              {counts[tier]} × {draft.prices[tier]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function hoursLabel(hours: number, minutes: number): string {
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} h ${minutes} min`;
}
