import type { CollectionPoint, FinishedAlbum } from "@sticker-collector/shared";
import { imageSrc } from "../../lib/imageUpload";

export interface CollectionPanelProps {
  collection: readonly CollectionPoint[];
  albumsCompleted: number;
  shelf: readonly FinishedAlbum[];
}

/**
 * The collection growing, and the shelf of finished covers.
 *
 * Momentum-framed, not economic: this is work becoming reward, with no prices,
 * no balance and no spend anywhere in it (`prd/08-reports.md` §Collection).
 */
export function CollectionPanel({ collection, albumsCompleted, shelf }: CollectionPanelProps) {
  const owned = collection.at(-1)?.stickers ?? 0;
  const peak = Math.max(1, owned);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-6">
        <div>
          <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">Stickers</p>
          <p className="font-numeric text-2xl font-bold text-ink">{owned}</p>
        </div>
        <div>
          <p className="font-body text-2xs tracking-kicker text-ink-muted uppercase">
            Albums finished
          </p>
          <p className="font-numeric text-2xl font-bold text-lime">{albumsCompleted}</p>
        </div>
      </div>

      <ul className="flex h-16 items-end gap-px" aria-label="Stickers collected over time">
        {collection.map((point) => (
          <li
            key={point.date}
            data-date={point.date}
            className="flex-1 rounded-t-xs bg-violet"
            style={{ height: `${Math.max(2, (point.stickers / peak) * 100)}%` }}
          />
        ))}
      </ul>

      {shelf.length > 0 && (
        <div>
          <p className="mb-2 font-body text-2xs tracking-kicker text-ink-muted uppercase">
            The shelf
          </p>
          <ul className="flex gap-2 overflow-x-auto">
            {shelf.map((album) => (
              <li key={album.albumId} className="shrink-0">
                <img
                  src={imageSrc(album.coverKey)}
                  alt={album.title}
                  className="w-16 rounded-lg border border-lime object-cover"
                  style={{ aspectRatio: "var(--aspect-card)" }}
                />
                <p className="mt-1 w-16 truncate font-body text-3xs text-ink-dim">{album.title}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
