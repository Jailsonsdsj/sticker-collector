import { Badge, type BadgeTone, type BadgeVariant } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

const TONES: BadgeTone[] = [
  "low",
  "med",
  "high",
  "coin",
  "lime",
  "magenta",
  "cyan",
  "violet",
  "neutral",
];
const VARIANTS: BadgeVariant[] = ["tint", "solid"];

export function Badges() {
  return (
    <Section n="11" title="Badge">
      <Panel>
        {VARIANTS.map((variant) => (
          <Row key={variant} label={variant}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} variant={variant}>
                {tone.toUpperCase()}
              </Badge>
            ))}
          </Row>
        ))}

        <Row label="sizes">
          <Badge size="sm">SMALL</Badge>
          <Badge size="md">MEDIUM</Badge>
        </Row>

        <Row label="overlay — reads on artwork, so it carries a scrim">
          <div className="relative flex h-24 w-18 items-end justify-center rounded-lg [background:var(--gradient-locked-hatch)] pb-2">
            <Badge variant="overlay" size="sm" font="numeric">
              LOCKED · B&amp;W
            </Badge>
          </div>
        </Row>

        <Row label="in context">
          <Badge tone="high">HIGH</Badge>
          <Badge tone="magenta" variant="solid" size="sm" font="numeric">
            1 LEFT!
          </Badge>
          <Badge tone="magenta" variant="solid" size="sm" font="numeric">
            ×2
          </Badge>
          <Badge tone="lime" variant="tint" font="numeric">
            ✓ Affordable
          </Badge>
          <Badge tone="coin" variant="tint" font="numeric">
            +30
          </Badge>
        </Row>
      </Panel>
    </Section>
  );
}
