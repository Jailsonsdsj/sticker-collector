/**
 * The token half of /dev/ui — every token rendered so a wrong value is visible,
 * not theoretical. Styling is tokens only: utilities or var(), never a literal.
 */
import { Section } from "./Section";
import { COLORS, FONT, MOTION, RADII, SHADOWS, SPACE, TIERS, TYPE } from "./tokenData";

export function TokenSheet() {
  return (
    <>
      <h1 className="mb-2 font-display text-7xl leading-display tracking-display uppercase italic">
        Sticker
        <br />
        Collector
      </h1>
      <p className="mb-10 font-numeric text-xs text-ink-muted tracking-mono uppercase">
        /dev/ui · tokens and primitives
      </p>

      <Section n="01" title="Palette">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {COLORS.map(([name, token, use]) => (
            <div key={token} className="overflow-hidden rounded-2xl border border-border bg-panel">
              <div className="h-16" style={{ background: `var(${token})` }} />
              <div className="p-3">
                <div className="font-body text-md">{name}</div>
                <div className="font-numeric text-xs text-ink-muted">{token}</div>
                <div className="mt-1 text-2xs text-ink-dim leading-snug">{use}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n="02" title="Type">
        <div className="flex flex-col gap-3 rounded-3xl border border-border bg-panel p-6">
          {TYPE.map(([size, family, sample]) => (
            <div key={size} className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 font-numeric text-xs text-ink-muted">{size}</span>
              <span className={`${size} ${FONT[family]} truncate`}>{sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="03" title="Spacing & radii">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-border bg-panel p-6">
            {SPACE.map((s) => (
              <div key={s} className="mb-2 flex items-center gap-3">
                <span className="w-14 font-numeric text-xs text-ink-muted">space-{s}</span>
                <span className="h-3 rounded-xs bg-lime" style={{ width: `var(--space-${s})` }} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 rounded-3xl border border-border bg-panel p-6">
            {RADII.map((r) => (
              <div key={r} className="text-center">
                <div
                  className="size-16 border border-border-strong bg-surface-3"
                  style={{ borderRadius: `var(--radius-${r})` }}
                />
                <div className="mt-1 font-numeric text-2xs text-ink-muted">{r}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section n="04" title="Elevation">
        <div className="flex flex-wrap gap-6 rounded-3xl border border-border bg-panel p-8">
          {SHADOWS.map((s) => (
            <div key={s} className="text-center">
              <div
                className="size-20 rounded-xl bg-panel-raised"
                style={{ boxShadow: `var(--shadow-${s})` }}
              />
              <div className="mt-2 font-numeric text-2xs text-ink-muted">{s}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section n="05" title="Rarity frames">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {TIERS.map((t) => (
            <div key={t} className="rounded-2xl border border-border bg-panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="size-3 rounded-xs"
                  style={{ background: `var(--color-rarity-${t})` }}
                />
                <span
                  className="font-display text-xl italic uppercase"
                  style={{ color: `var(--color-rarity-${t})` }}
                >
                  {t}
                </span>
              </div>
              {["locked", "unlocked"].map((state) => (
                <div
                  key={state}
                  className="mb-2 aspect-card rounded-lg"
                  style={{
                    background: `var(--gradient-frame-${t})`,
                    padding: `var(--frame-pad-${t})`,
                  }}
                >
                  <div
                    className="flex size-full items-center justify-center rounded-sm bg-void font-numeric text-3xs text-ink-muted uppercase"
                    style={{
                      filter:
                        state === "locked" ? "var(--filter-locked)" : "var(--filter-unlocked)",
                    }}
                  >
                    {state}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section n="06" title="Motion">
        <div className="flex flex-wrap gap-6 rounded-3xl border border-border bg-panel p-8">
          {MOTION.map(([name, label]) => (
            <div key={name} className="w-40 text-center">
              <div
                className="mx-auto size-20 rounded-xl bg-panel-raised shadow-holo"
                style={{ animation: `var(--animate-${name})`, animationIterationCount: "infinite" }}
              />
              <div className="mt-2 font-numeric text-2xs text-ink-muted">{name}</div>
              <div className="text-2xs text-ink-dim leading-snug">{label}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
