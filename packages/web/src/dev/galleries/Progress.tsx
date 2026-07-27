import { useState } from "react";
import { Button, ProgressBar, type ProgressTone, Tabs } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

const TONES: ProgressTone[] = ["cyan", "lime", "coin", "violet", "magenta"];
const FILTERS = [
  { value: "all" as const, label: "ALL" },
  { value: "locked" as const, label: "LOCKED" },
  { value: "progress" as const, label: "IN PROGRESS" },
  { value: "done" as const, label: "COMPLETED" },
  { value: "archived" as const, label: "ARCHIVED", disabled: true },
];

export function Progress() {
  const [pct, setPct] = useState(82);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [type, setType] = useState<"routine" | "oneoff">("routine");

  return (
    <Section n="14" title="ProgressBar & Tabs">
      <Panel>
        <Row label={`sizes — drag the value (${pct}%)`}>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-label="Progress value"
            className="w-48 accent-lime"
          />
          <Button variant="ghost" tone="cyan" size="sm" onClick={() => setPct(4)}>
            Try 4%
          </Button>
        </Row>

        <div className="flex flex-col gap-4">
          <ProgressBar value={pct} size="xs" aria-label="Wizard step" />
          <ProgressBar value={pct} size="sm" fill="accent" tone="violet" aria-label="Epic" />
          <ProgressBar value={pct} size="md" label={`${pct}%`} />
          <ProgressBar value={pct} size="lg" label={`${pct}% · ${Math.round(pct * 0.6)}/60`} />
        </div>

        <Row label="tones · solid fill">
          <div className="flex w-full flex-col gap-3">
            {TONES.map((tone) => (
              <ProgressBar
                key={tone}
                value={pct}
                size="sm"
                fill="accent"
                tone={tone}
                aria-label={tone}
              />
            ))}
          </div>
        </Row>

        <Row label="tabs · segmented control, per-option tone">
          <Tabs
            items={[
              { value: "routine", label: "↻ Routine", tone: "violet" },
              { value: "oneoff", label: "· One-off", tone: "cyan" },
            ]}
            value={type}
            onChange={setType}
            label="Task type"
            className="w-64"
          />
        </Row>

        <Row label="tabs · small, single tone, one disabled">
          <Tabs
            items={FILTERS}
            value={filter}
            onChange={setFilter}
            tone="coin"
            size="sm"
            label="Album filter"
          />
        </Row>
      </Panel>
    </Section>
  );
}
