import { Button, type ButtonTone, type ButtonVariant, Coin } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

const TONES: ButtonTone[] = ["coin", "lime", "magenta", "violet", "cyan", "neutral"];
const VARIANTS: ButtonVariant[] = ["solid", "outline", "ghost", "holo"];

export function Buttons() {
  return (
    <Section n="07" title="Button">
      <Panel>
        {VARIANTS.map((variant) => (
          <Row key={variant} label={variant}>
            {TONES.map((tone) => (
              <Button key={tone} variant={variant} tone={tone}>
                {tone}
              </Button>
            ))}
          </Row>
        ))}

        <Row label="sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>

        <Row label="states">
          <Button>Default</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" tone="violet" disabled>
            Outline disabled
          </Button>
          <Button variant="ghost" tone="neutral">
            Cancel
          </Button>
        </Row>

        <Row label="in context">
          <Button tone="lime" size="sm">
            Save
          </Button>
          <Button variant="outline" tone="violet">
            ＋ New task — full form
          </Button>
          <Button variant="holo" tone="coin">
            🎲 Random pull · 40
          </Button>
          <Button variant="outline" tone="magenta" size="sm">
            🗑 Delete
          </Button>
        </Row>

        <div className="max-w-sm">
          <Row label="block">
            <Button block>
              Unlock · 400 <Coin size="xs" />
            </Button>
          </Row>
        </div>
      </Panel>
    </Section>
  );
}
