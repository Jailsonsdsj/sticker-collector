import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

export type TabsTone = "violet" | "cyan" | "coin" | "lime" | "magenta";
export type TabsSize = "sm" | "md";

const TONE: Record<TabsTone, string> = {
  violet: "--color-violet",
  cyan: "--color-cyan",
  coin: "--color-coin",
  lime: "--color-lime",
  magenta: "--color-magenta",
};

const SIZE: Record<TabsSize, { track: string; option: string }> = {
  sm: { track: "gap-1 rounded-lg p-0.5", option: "rounded-md px-3 py-2 text-sm" },
  md: { track: "gap-1.5 rounded-xl p-1", option: "rounded-md px-4 py-2 text-sm" },
};

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Each option can carry its own accent — the design tints Routine violet
   *  and One-off cyan inside the same control. */
  tone?: TabsTone;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  tone?: TabsTone;
  size?: TabsSize;
  label?: string;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  tone = "violet",
  size = "md",
  label,
  className,
}: TabsProps<T>) {
  const s = SIZE[size];

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx("flex border border-surface-4 bg-panel", s.track, className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            style={{ "--ui-accent": `var(${TONE[item.tone ?? tone]})` } as CSSProperties}
            className={cx(
              "flex-1 cursor-pointer border-none font-body text-center font-bold outline-none",
              "transition-[background,color] focus-visible:outline-2 focus-visible:outline-offset-2",
              "focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-40",
              s.option,
              selected
                ? "[background:var(--ui-accent)] text-ink-inverse"
                : "bg-transparent text-ink-secondary not-disabled:hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
