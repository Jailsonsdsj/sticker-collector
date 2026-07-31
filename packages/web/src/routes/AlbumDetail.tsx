import type { PullResult, Tier, TierRecord } from "@sticker-collector/shared";
import { canPullRandom, duplicateRefund, effectiveWeights } from "@sticker-collector/shared";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { DeleteAlbumDialog } from "../components/DeleteAlbumDialog";
import { ExportPanel } from "../components/ExportPanel";
import { AppHeader, StickerGrid } from "../components/layout";
import { RevealDialog } from "../components/RevealDialog";
import { Celebration } from "../components/reveal/Celebration";
import { StickerSlot } from "../components/StickerSlot";
import { StickerViewer } from "../components/StickerViewer";
import { Button, Chip, EmptyState, ErrorState, ProgressBar, Skeleton } from "../components/ui";
import { cx } from "../components/ui/cx";
import { ApiError } from "../lib/api";
import { useBuySticker, useDeleteAlbum, usePullSticker, useSellDuplicate } from "../lib/mutations";
import { celebrateSticker, placeSticker } from "../lib/placement";
import { useAlbum, useWallet } from "../lib/queries";

/**
 * One album, all of its slots.
 *
 * Browsing is always allowed — a locked album shows every sticker it will ever
 * hold, in black and white, with its rarity frames intact. Buying is what the
 * lock forbids (`prd/04-albums.md` §5, §Locked 4).
 */
const SHOWN_FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "unlocked" as const, label: "Unlocked" },
  { value: "locked" as const, label: "Locked" },
];

/**
 * The coin, wherever a price is. Same glyph and gradient as the wallet, so a
 * number that costs coins never looks like a number that means anything else.
 */
function CoinIcon({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex items-center justify-center rounded-full font-numeric text-coin-ink [background:var(--gradient-coin)]",
        // Matched to the number it sits beside: a 16px coin next to a 20px
        // figure reads as a bullet point rather than as currency.
        size === "md" ? "size-6 text-2xs" : "size-4 text-3xs",
      )}
    >
      ¢
    </span>
  );
}

export function AlbumDetail() {
  const { id = "" } = useParams();
  /** All / Unlocked / Locked. "Locked" is what "Missing only" used to mean. */
  const [shown, setShown] = useState<"all" | "unlocked" | "locked">("all");
  const [reveal, setReveal] = useState<PullResult | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  /** A sticker that has been revealed and is waiting to be shown in the grid. */
  const [placing, setPlacing] = useState<string | null>(null);
  /** True from the moment the album first reads as complete until dismissed. */
  const [celebrating, setCelebrating] = useState(false);
  /** A sticker just bought outright, waiting for its slot to re-render owned. */
  const [bought, setBought] = useState<{ id: string; tier: Tier } | null>(null);
  const wasComplete = useRef<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const album = useAlbum(id);
  const wallet = useWallet();
  const buy = useBuySticker(id);
  const pull = usePullSticker(id);
  const sell = useSellDuplicate(id);
  const remove = useDeleteAlbum();

  /**
   * Scroll to the sticker once the grid is actually showing it.
   *
   * Above the early returns, because hooks cannot be conditional — and an
   * effect rather than something the dialog's handler does directly, because
   * clearing the filter is a state change: at the moment of the tap the slot
   * may not be in the DOM yet. Running after the render that follows is what
   * makes "scroll to it" find anything at all.
   */
  /**
   * Fire the celebration on the TRANSITION into complete, never on arrival.
   *
   * Opening a finished album should not throw confetti at you every time. The
   * first observed status seeds the ref rather than triggering, so only a
   * completion that happens while you are looking counts.
   */
  useEffect(() => {
    const complete = album.data?.album.status === "completed";
    if (album.data === undefined) return;
    if (wasComplete.current === null) {
      wasComplete.current = complete;
      return;
    }
    if (complete && !wasComplete.current) setCelebrating(true);
    wasComplete.current = complete;
  }, [album.data]);

  /**
   * The bought sticker celebrates once the grid shows it as owned.
   *
   * Same shape as the placement effect and for the same reason: the purchase
   * invalidates the album, so at the moment the request resolves the slot is
   * still the locked one. Playing then would flourish a grey square.
   */
  useEffect(() => {
    if (!bought) return;
    if (celebrateSticker(bought.id, bought.tier)) setBought(null);
  }, [bought]);

  useEffect(() => {
    if (!placing) return;
    const slot = placeSticker(placing);
    // Not found means the grid has not caught up yet; the next render tries
    // again. Clearing on success stops it re-scrolling on every later render.
    if (slot) setPlacing(null);
  }, [placing]);

  if (album.error instanceof ApiError && album.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  if (album.isLoading) {
    return (
      <>
        <AppHeader title="Album" />
        <Skeleton variant="block" />
      </>
    );
  }

  // 404 is the one non-401 status with real meaning here, and it is the only
  // one that earns the "deleted" copy below. A 500 or an offline read reaches
  // the same `!album.data` state, and telling someone their album is gone on
  // the strength of a dropped connection is the worst lie this app can tell.
  const notFound = album.error instanceof ApiError && album.error.status === 404;

  if (album.isError && !notFound) {
    return (
      <>
        <AppHeader title="Album" />
        <ErrorState error={album.error} onRetry={() => void album.refetch()} />
      </>
    );
  }

  if (!album.data) {
    return (
      <>
        <AppHeader title="Album" />
        <EmptyState
          icon="◈"
          title="No such album"
          description="It may have been deleted, or the link is wrong."
        />
      </>
    );
  }

  const { album: summary, stickers } = album.data;
  const balance = wallet.data?.balance ?? 0;
  const unlocked = summary.status !== "locked";
  const visible = stickers.filter((sticker) =>
    shown === "all" ? true : shown === "unlocked" ? sticker.quantity > 0 : sticker.quantity === 0,
  );
  const refund = duplicateRefund(summary.randomPrice);

  // The viewer moves between COLLECTED stickers only, and it walks the list the
  // grid is showing — so paging through it follows the order on screen rather
  // than a second one the user cannot see.
  const viewable = visible.filter((sticker) => sticker.quantity > 0);

  // Reachability, decided by the same function the Worker uses. The API is
  // still the authority — it 409s — but the button should not offer a roll that
  // is guaranteed to be refused, and it must not simply mean "complete": a tier
  // at zero odds can hold unowned stickers forever.
  const rollable = pullIsPossible(stickers, summary.odds);
  const canPull = unlocked && rollable && balance >= summary.randomPrice;

  return (
    <>
      <AppHeader title={summary.title} />

      {/* The album's own words, straight under its name — what it is, before
          how far through it you are. */}
      {summary.description && (
        <p className="mb-3 font-body text-md text-ink-secondary">{summary.description}</p>
      )}

      <div className="mb-3 flex items-center gap-2 overflow-x-auto">
        <span className="font-body text-2xs tracking-kicker text-ink-muted uppercase">Show</span>
        {SHOWN_FILTERS.map((option) => (
          <Chip
            key={option.value}
            size="sm"
            tone="cyan"
            fill="tint"
            font="body"
            className="shrink-0"
            selected={shown === option.value}
            onClick={() => setShown(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <ProgressBar
          value={summary.percent}
          tone={summary.status === "completed" ? "lime" : "cyan"}
          label={`${summary.percent}%`}
          aria-label={`${summary.owned} of ${summary.total} collected`}
        />
        <p className="font-body text-sm text-ink-dim">
          {summary.owned} of {summary.total} collected
          {!unlocked && " · locked"}
        </p>
      </div>

      {!unlocked && (
        <p className="mb-4 font-body text-sm text-ink-secondary">
          Unlock this album from the shelf to start collecting. Until then you can see everything it
          holds, but nothing can be bought.
        </p>
      )}

      {unlocked && (
        <div className="mb-4 flex items-center gap-3">
          <Button
            tone="violet"
            disabled={!canPull || pull.isPending}
            loading={pull.isPending}
            onClick={async () => setReveal(await pull.mutateAsync())}
          >
            Random sticker · <CoinIcon /> {summary.randomPrice}
          </Button>

          {/* What you have to spend, on the line where spending happens. */}
          {/* Larger than the prices around it: this is the number you check
              before deciding, not one of the several you are choosing between. */}
          <span className="ml-auto flex shrink-0 items-center gap-1 font-numeric text-2xl font-bold text-coin">
            <CoinIcon size="md" />
            {balance.toLocaleString()}
          </span>
        </div>
      )}

      {unlocked && !rollable && (
        <p className="mb-4 font-body text-sm text-ink-dim">
          Nothing left that a roll can reach — the rest is direct purchase only.
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Nothing missing"
          description="Every slot in this album is filled."
          action={
            <Button variant="outline" tone="cyan" onClick={() => setShown("all")}>
              Show the whole album
            </Button>
          }
        />
      ) : (
        <StickerGrid>
          {visible.map((sticker) => (
            <StickerSlot
              key={sticker.id}
              sticker={sticker}
              price={summary.prices[sticker.tier as Tier]}
              albumUnlocked={unlocked}
              affordable={balance >= summary.prices[sticker.tier as Tier]}
              pending={buy.isPending || sell.isPending}
              onBuy={() =>
                buy.mutate(sticker.id, {
                  onSuccess: () => setBought({ id: sticker.id, tier: sticker.tier as Tier }),
                })
              }
              refund={refund}
              onSell={() => sell.mutate(sticker.id)}
              hideLocked={summary.hideLocked}
              lockedCoverKey={summary.lockedCoverKey}
              onOpen={() => setViewing(viewable.findIndex((s) => s.id === sticker.id))}
            />
          ))}
        </StickerGrid>
      )}
      {/* Completion unlocks the print export — the reward for finishing (§Completed 1). */}
      {summary.status === "completed" && <ExportPanel album={album.data} />}

      <div className="mt-8 border-border border-t pt-4">
        <Button variant="ghost" tone="magenta" size="sm" onClick={() => setDeleting(true)}>
          Delete this album
        </Button>
      </div>

      {celebrating && (
        <Celebration
          title={summary.title}
          coverKey={summary.coverKey}
          onClose={() => setCelebrating(false)}
        />
      )}

      <StickerViewer
        stickers={viewable}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />

      <DeleteAlbumDialog
        open={deleting}
        title={summary.title}
        owned={summary.owned}
        pending={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await remove.mutateAsync(id);
          setDeleting(false);
          navigate("/albums");
        }}
      />

      <RevealDialog
        pull={reveal}
        imageKey={stickers.find((s) => s.id === reveal?.stickerId)?.imageKey ?? null}
        selling={sell.isPending}
        onSell={async () => {
          if (reveal) await sell.mutateAsync(reveal.stickerId);
          setReveal(null);
        }}
        onClose={() => {
          // The reveal ends by answering "where did that go?". Clearing the
          // filter first is not a courtesy: with "Locked" on, the sticker that
          // was just earned is no longer in the grid, so there would be nothing
          // to scroll to.
          if (reveal) {
            setShown("all");
            setPlacing(reveal.stickerId);
          }
          setReveal(null);
        }}
      />
    </>
  );
}

/** True while a roll could still return something the user does not own. */
function pullIsPossible(
  stickers: { tier: string; quantity: number }[],
  odds: TierRecord<number>,
): boolean {
  const counts: TierRecord<number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const owned: TierRecord<number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const sticker of stickers) {
    const tier = sticker.tier as Tier;
    counts[tier] += 1;
    if (sticker.quantity > 0) owned[tier] += 1;
  }
  return canPullRandom({ weights: effectiveWeights(odds, counts), counts, owned });
}
