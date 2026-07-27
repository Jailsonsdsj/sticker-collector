import { useState } from "react";
import { Chip, type ChipTone } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

const TONES: ChipTone[] = ["coin", "lime", "violet", "cyan", "magenta", "low", "med", "high"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS = [15, 30, 60, 90];
const FILTERS = ["ALL", "LOCKED", "IN PROGRESS", "COMPLETED"];

export function Chips() {
  const [effort, setEffort] = useState(30);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [filter, setFilter] = useState("ALL");

  return (
    <Section n="09" title="Chip">
      <Panel>
        <Row label="tones · selected, solid">
          {TONES.map((tone) => (
            <Chip key={tone} tone={tone} selected font="body">
              {tone}
            </Chip>
          ))}
        </Row>

        <Row label="tones · selected, tint">
          {TONES.map((tone) => (
            <Chip key={tone} tone={tone} selected fill="tint" font="body">
              {tone}
            </Chip>
          ))}
        </Row>

        <Row label="unselected · bare / filled">
          <Chip font="body">bare</Chip>
          <Chip surface="filled" font="body">
            filled
          </Chip>
          <Chip shape="rounded" font="body">
            rounded, bare
          </Chip>
          <Chip shape="rounded" surface="filled" font="body">
            rounded, filled
          </Chip>
          <Chip font="body" disabled>
            disabled
          </Chip>
        </Row>

        <Row label="effort presets — tap one">
          {PRESETS.map((v) => (
            <Chip key={v} tone="lime" selected={effort === v} onClick={() => setEffort(v)}>
              {v}m
            </Chip>
          ))}
        </Row>

        <Row label="weekday picker — five taps make a Mon–Fri habit">
          {WEEKDAYS.map((d, i) => (
            <Chip
              key={d}
              tone="violet"
              shape="rounded"
              selected={days.includes(i)}
              onClick={() =>
                setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
              }
              className="w-11"
            >
              {d.charAt(0)}
            </Chip>
          ))}
        </Row>

        <Row label="album filters">
          {FILTERS.map((f) => (
            <Chip
              key={f}
              tone="coin"
              size="sm"
              surface="filled"
              selected={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </Chip>
          ))}
        </Row>

        <Row label="priority selector — tint fill">
          <Chip tone="low" shape="rounded" font="body" fill="tint" selected>
            LOW
          </Chip>
          <Chip tone="med" shape="rounded" font="body" fill="tint">
            MED
          </Chip>
          <Chip tone="high" shape="rounded" font="body" fill="tint">
            HIGH
          </Chip>
        </Row>
      </Panel>
    </Section>
  );
}
