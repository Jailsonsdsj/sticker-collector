import type { ReactNode } from "react";

export function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-baseline gap-3">
        <span className="rounded-xs bg-cyan px-3 py-1 font-display text-md text-ink-inverse italic tracking-wide uppercase">
          {n}
        </span>
        <span className="font-display text-3xl tracking-display uppercase italic">{title}</span>
      </h2>
      {children}
    </section>
  );
}

/** One labelled row of specimens inside a gallery panel. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-border bg-panel p-6">
      {children}
    </div>
  );
}
