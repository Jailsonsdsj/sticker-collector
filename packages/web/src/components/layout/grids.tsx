import type { ReactNode } from "react";
import { cx } from "../ui/cx";

/**
 * The two responsive grids the spec fixes by number — docs/prd/04-albums.md
 * §Geometry: "Sticker columns: 3 on iPhone, 4 on iPad, 6 on desktop. Album
 * columns: 2 / 3 / 4."
 *
 * They live here, in one file, rather than as a class string repeated across
 * six screens — a contract that is written down once cannot drift.
 *
 * Breakpoints are Tailwind's defaults: base is a phone, `md` (768px) is an
 * iPad portrait, `lg` (1024px) is a desktop or an iPad landscape.
 */
interface GridProps {
  children: ReactNode;
  className?: string;
}

export function StickerGrid({ children, className }: GridProps) {
  return (
    <div className={cx("grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6", className)}>
      {children}
    </div>
  );
}

export function AlbumGrid({ children, className }: GridProps) {
  return (
    <div className={cx("grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}
