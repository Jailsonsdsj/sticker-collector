import { useState } from "react";
import { Checkbox } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const SCHEDULED = [true, true, true, true, true, false, false];
const TODAY = 2;

export function Checkboxes() {
  const [done, setDone] = useState<boolean[]>([true, true, false, false, false, false, false]);
  const [one, setOne] = useState(false);

  return (
    <Section n="10" title="Checkbox">
      <Panel>
        <Row label="states">
          <Checkbox checked={one} onChange={setOne} label="Toggle me" />
          <Checkbox checked label="Checked" />
          <Checkbox label="Unchecked" />
          <Checkbox muted label="Unscheduled" />
          <Checkbox checked disabled label="Checked, disabled" />
          <Checkbox disabled label="Disabled" />
          <Checkbox strong label="Scheduled, not done" />
        </Row>

        <Row label="sizes">
          <Checkbox size="sm" checked label="Small, checked" />
          <Checkbox size="sm" label="Small" />
          <Checkbox size="md" checked label="Medium, checked" />
          <Checkbox size="md" label="Medium" />
        </Row>

        <div className="flex flex-col gap-3">
          <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
            weekly grid row — unscheduled days are inert dots, today wears the halo
          </span>
          <div className="grid max-w-md grid-cols-[5rem_repeat(7,1fr)] items-center gap-1">
            <span />
            {DAYS.map((d, i) => (
              <span
                key={d}
                className={`text-center font-numeric text-2xs ${
                  i === TODAY ? "text-cyan" : "text-ink-muted"
                }`}
              >
                {d}
              </span>
            ))}
            <span className="truncate font-body text-sm">Stretch</span>
            {DAYS.map((d, i) => (
              <Checkbox
                key={d}
                size="sm"
                className="w-full"
                muted={!SCHEDULED[i]}
                strong={SCHEDULED[i]}
                checked={done[i]}
                label={`${d} — Stretch`}
                onChange={(next) => setDone((prev) => prev.map((v, idx) => (idx === i ? next : v)))}
              />
            ))}
          </div>
        </div>
      </Panel>
    </Section>
  );
}
