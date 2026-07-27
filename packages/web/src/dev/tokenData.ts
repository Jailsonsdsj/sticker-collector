/** The token inventory rendered by TokenSheet. Data only — no markup. */
export const COLORS = [
  ["Void", "--color-void", "App background, deepest ink"],
  ["Panel", "--color-panel", "Cards, sheets, list rows"],
  ["Panel raised", "--color-panel-raised", "Completed album, elevated sheets"],
  ["Coin Gold", "--color-coin", "Currency, primary CTA, rewards"],
  ["Neon Magenta", "--color-magenta", "High priority, spend, danger"],
  ["Electric Cyan", "--color-cyan", "Links, Today, rare tier"],
  ["Acid Lime", "--color-lime", "Earn, affordable, success"],
  ["Ultra Violet", "--color-violet", "Epic tier, holo accents"],
  ["Ink Light", "--color-ink", "Primary text on dark"],
  ["Ink Secondary", "--color-ink-secondary", "Inactive chips, segment off state, body copy"],
  ["Muted", "--color-ink-muted", "Secondary text, metadata"],
  ["Dim", "--color-ink-dim", "Tertiary text, notes"],
  ["Faint", "--color-ink-faint", "Disabled, epic-less accent"],
  ["Ghost", "--color-ink-ghost", "Unscheduled weekly cell"],
  ["Ink Overlay", "--color-ink-overlay", "Text on an image scrim"],
];

export const TYPE = [
  ["text-7xl", "display", "Pack Ripped"],
  ["text-5xl", "numeric", "1,240"],
  ["text-3xl", "display", "Albums"],
  ["text-xl", "body", "Album title"],
  ["text-lg", "body", "Finish the laundry"],
  ["text-base", "body", "Button label"],
  ["text-md", "body", "Secondary body copy"],
  ["text-sm", "numeric", "12 DAYS"],
  ["text-xs", "numeric", "WALLET"],
  ["text-2xs", "numeric", "1 LEFT!"],
  ["text-3xs", "numeric", "LOCKED"],
] as const;

export const FONT = { display: "font-display italic", numeric: "font-numeric", body: "font-body" };

export const SPACE = ["1", "2", "3", "4", "5", "6", "8", "10", "12"];
export const RADII = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
export const SHADOWS = ["sm", "md", "lg", "coin", "holo", "lip-coin", "lip-lime", "lip-magenta"];
export const TIERS = ["common", "rare", "epic", "legendary"];
export const MOTION = [
  ["coin-float", "Coin gain ticker"],
  ["reveal-flood", "B&W floods to colour"],
  ["pack-shake", "The pull, before the flash"],
  ["burst-ring", "Reveal burst"],
  ["legend-glow", "Legendary pulse"],
];
