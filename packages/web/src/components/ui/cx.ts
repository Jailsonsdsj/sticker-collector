/** Join truthy class names. Deliberately not tailwind-merge — primitives own
 *  their classes, and callers extend rather than override. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** A tone's colour wiring, handed to a primitive as custom properties so the
 *  Tailwind classes can stay static (`[background:var(--ui-accent)]`). */
export type ToneVars = Record<`--ui-${string}`, string>;

export function toneVars(accent: string, opts?: { on?: string; gradient?: string }): ToneVars {
  return {
    "--ui-accent": `var(${accent})`,
    "--ui-on": `var(${opts?.on ?? "--color-ink-inverse"})`,
    "--ui-gradient": opts?.gradient ? `var(${opts.gradient})` : `var(${accent})`,
    "--ui-tint": `color-mix(in srgb, var(${accent}) 12%, transparent)`,
    "--ui-tint-hover": `color-mix(in srgb, var(${accent}) 20%, transparent)`,
    "--ui-tint-border": `color-mix(in srgb, var(${accent}) 34%, transparent)`,
  };
}
