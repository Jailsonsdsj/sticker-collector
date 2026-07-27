import { Input, type InputTone, Textarea } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

const TONES: InputTone[] = ["default", "numeric", "coin", "url", "danger"];
const PLACEHOLDER: Record<InputTone, string> = {
  default: "What needs doing?",
  numeric: "30",
  coin: "30",
  url: "https://",
  danger: "Type the album title",
};

export function Fields() {
  return (
    <Section n="08" title="Input & Textarea">
      <Panel>
        <div className="grid gap-4 md:grid-cols-2">
          {TONES.map((tone) => (
            <Input
              key={tone}
              id={`input-${tone}`}
              tone={tone}
              label={tone}
              placeholder={PLACEHOLDER[tone]}
            />
          ))}
        </div>

        <Row label="sizes">
          <div className="w-40">
            <Input size="sm" placeholder="Small" />
          </div>
          <div className="w-40">
            <Input size="md" placeholder="Medium" />
          </div>
        </Row>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            id="input-required"
            label="Title"
            required
            placeholder="What needs doing?"
            defaultValue="Finish the laundry"
          />
          <Input
            id="input-hint"
            tone="coin"
            label="Reward (coins)"
            hint="matches effort"
            defaultValue="30"
          />
          <Input
            id="input-error"
            label="Reward (coins)"
            error="Must be a whole number of coins"
            defaultValue="12.5"
          />
          <Input id="input-disabled" label="Disabled" disabled defaultValue="Locked" />
        </div>

        <Row label="native types">
          <div className="w-44">
            <Input type="date" tone="numeric" size="sm" />
          </div>
          <div className="w-32">
            <Input type="time" tone="numeric" size="sm" />
          </div>
          <div className="w-52">
            <Input type="password" placeholder="New passphrase" size="sm" />
          </div>
        </Row>

        <div className="grid gap-4 md:grid-cols-2">
          <Textarea
            id="textarea-default"
            label="Description"
            placeholder="Notes, context, links…"
          />
          <Textarea id="textarea-resizable" label="Resizable" resizable rows={2} />
        </div>
      </Panel>
    </Section>
  );
}
