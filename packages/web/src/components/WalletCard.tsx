import type { ReactNode } from "react";
import { Skeleton } from "./ui";

/** One minute of effort is one coin, so the balance doubles as hours invested. */
function hoursOf(coins: number): string {
  const hours = Math.floor(coins / 60);
  const minutes = coins % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export interface WalletCardProps {
  balance?: number;
  loading?: boolean;
  /**
   * Coins from completions still inside their undo window. They are shown as
   * part of the balance the moment the box is ticked — "the reward must be
   * felt, or the loop is just a checkbox" — even though the server has not been
   * told yet, and they come straight back off if the completion is undone.
   */
  pendingCoins?: number;
  /**
   * The corner slot, above the hours-equivalent line.
   *
   * A slot rather than a hard-coded link: the wallet is presentational and has
   * no business importing the router. The caller decides what belongs here.
   */
  action?: ReactNode;
}

export function WalletCard({ balance, loading, pendingCoins = 0, action }: WalletCardProps) {
  const shown = (balance ?? 0) + pendingCoins;

  return (
    <section
      // Names the region, so the balance is reachable by role rather than by a
      // test-only hook. The visible "Wallet" kicker is styling; this is the
      // accessible name.
      aria-label="Wallet"
      className="mb-5 overflow-hidden rounded-4xl border border-border p-5 [background:var(--gradient-wallet)]"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-numeric text-xs text-ink-muted tracking-mono uppercase">Wallet</div>
          <div className="relative mt-1 flex items-baseline gap-2">
            <span
              aria-hidden
              className="animate-coin-spin inline-flex size-7 items-center justify-center rounded-full font-numeric text-sm text-coin-ink shadow-coin-sm [background:var(--gradient-coin)]"
            >
              ¢
            </span>
            {loading ? (
              <Skeleton variant="text" className="w-28" />
            ) : (
              <span
                aria-live="polite"
                className="font-numeric text-5xl leading-none font-bold text-coin"
              >
                {shown.toLocaleString()}
              </span>
            )}

            {pendingCoins > 0 && (
              // Keyed on the amount so a second completion re-runs the float
              // rather than sitting there statically.
              <span
                key={pendingCoins}
                aria-hidden
                className="absolute top-0 left-full ml-2 font-numeric text-xl font-bold text-lime animate-coin-float"
              >
                +{pendingCoins}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {action}
          {!loading && (
            <div className="text-right font-numeric text-base text-ink-secondary">
              ≈ {hoursOf(shown)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
