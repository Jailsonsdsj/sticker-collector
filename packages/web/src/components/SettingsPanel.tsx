import type { ReactNode } from "react";

/**
 * One card on the Settings screen.
 *
 * Settings grew a section at a time — backup first, then the app icon, then the
 * error log — and each one dressed itself: a bare heading over loose content
 * next to two bordered cards, with the headings a size apart. Three panels that
 * *describe* the same shape is three chances to drift; one component is none.
 *
 * The shape: a rounded card on the panel ground, a display heading, one line of
 * prose saying what the section is for, and an optional action sitting on the
 * heading's line — where a "Clear" belongs, rather than below the thing it
 * clears.
 */
export interface SettingsPanelProps {
  /** The accessible name of the region. Usually the same words as `title`. */
  label: string;
  title: string;
  description: ReactNode;
  /** Sits on the heading's line, trailing. */
  action?: ReactNode;
  children?: ReactNode;
}

export function SettingsPanel({ label, title, description, action, children }: SettingsPanelProps) {
  return (
    <section aria-label={label} className="mb-5 rounded-3xl border border-border bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-display uppercase italic">{title}</h2>
        {action}
      </div>

      <p className="mt-1 font-body text-sm text-ink-secondary">{description}</p>

      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
