import { type CSSProperties, useState } from "react";
import { cx } from "./cx";

/**
 * An image that shimmers until it has actually decoded.
 *
 * Album grids load many pictures at once, often over a phone connection, and an
 * empty tile is indistinguishable from a broken one. The shimmer says "on its
 * way" for exactly as long as that is true — it is driven by the image's own
 * `load` event rather than by a timer, so it cannot lie in either direction.
 *
 * The placeholder sits behind the image rather than instead of it, so there is
 * no reflow when the picture arrives: the tile is already the right size.
 */
export interface ImageTileProps {
  src: string;
  /** Empty by default: a sticker's art is decorative inside a labelled slot. */
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
}

export function ImageTile({ src, alt = "", className, style, loading = "lazy" }: ImageTileProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className="relative block h-full w-full">
      {/* Stops on failure too. A shimmer that runs forever over an image which
          is never coming promises something the app cannot deliver. */}
      {!loaded && !failed && (
        <span aria-hidden className="animate-image-shimmer absolute inset-0 block bg-surface-2" />
      )}
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cx("relative h-full w-full", className)}
        style={style}
      />
    </span>
  );
}
