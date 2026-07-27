import type { ReactNode } from "react";
import { cx } from "../ui/cx";

/**
 * The per-screen title row. There is no persistent header in the design —
 * each screen shouts its own name in the display face, and Home shows the
 * wallet card instead of a title at all.
 */
export interface AppHeaderProps {
  title: ReactNode;
  /** A back chevron, on detail screens. */
  leading?: ReactNode;
  /** The wallet pill, a settings button, a destructive action. */
  trailing?: ReactNode;
  className?: string;
}

export function AppHeader({ title, leading, trailing, className }: AppHeaderProps) {
  return (
    <header className={cx("mb-4 flex items-center gap-3", className)}>
      {leading}
      <h1 className="flex-1 truncate font-display text-4xl tracking-display uppercase italic">
        {title}
      </h1>
      {trailing}
    </header>
  );
}
