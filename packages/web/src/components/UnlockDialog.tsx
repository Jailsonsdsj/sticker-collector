import { Button, Dialog } from "./ui";

/**
 * The two facts a confirmation needs.
 *
 * An album and a puzzle are different things everywhere else in the app; at the
 * moment of spending they ask the identical question — what does this cost, and
 * what is left — so they get the identical dialog rather than a copy of it.
 */
export interface Unlockable {
  title: string;
  unlockPrice: number;
}

export interface UnlockDialogProps {
  item: Unlockable | null;
  balance: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirms an unlock, of either kind of thing on the shelf.
 *
 * Spending is irreversible — the ledger is append-only, so a mis-tap costs
 * coins that no amount of undo can return. This is also the only place the two
 * numbers that matter can sit side by side: what it costs, and what is left
 * afterwards.
 */
export function UnlockDialog({ item, balance, pending, onConfirm, onClose }: UnlockDialogProps) {
  const price = item?.unlockPrice ?? 0;
  const affordable = balance >= price;
  const after = balance - price;

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={item ? `Unlock ${item.title}?` : "Unlock"}
      footer={
        <>
          <Button variant="ghost" tone="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            tone="coin"
            disabled={!affordable || pending}
            loading={pending}
            onClick={onConfirm}
          >
            {affordable ? `Spend ${price}` : "Not enough coins"}
          </Button>
        </>
      }
    >
      <p className="font-body text-sm text-ink-secondary">
        {affordable ? (
          <>
            This costs <span className="font-numeric font-bold text-coin">{price}</span> coins. You
            will have <span className="font-numeric font-bold text-ink">{after}</span> left.
          </>
        ) : (
          <>
            This costs <span className="font-numeric font-bold text-coin">{price}</span> coins and
            you have <span className="font-numeric font-bold text-ink">{balance}</span>. Complete a
            few tasks and come back.
          </>
        )}
      </p>
    </Dialog>
  );
}
