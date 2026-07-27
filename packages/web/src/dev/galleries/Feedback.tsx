import { useState } from "react";
import { Button, EmptyState, Skeleton, Toast, type ToastTone } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

const TONES: ToastTone[] = ["neutral", "earn", "spend", "danger"];
const COPY: Record<ToastTone, { title: string; body: string }> = {
  neutral: { title: "Task saved", body: "Stretch · Mon–Fri" },
  earn: { title: "+30 coins", body: "Finish the laundry" },
  spend: { title: "−40 coins", body: "Random pull · Cidades" },
  danger: { title: "Not enough coins", body: "You need 120 more to unlock this" },
};

export function Feedback() {
  const [dismissed, setDismissed] = useState<ToastTone[]>([]);

  return (
    <Section n="13" title="Toast, EmptyState & Skeleton">
      <Panel>
        <div className="flex flex-col gap-3">
          <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
            toast · tones — presentational only, the queue lands in T-11
          </span>
          <div className="flex max-w-md flex-col gap-3">
            {TONES.filter((t) => !dismissed.includes(t)).map((tone) => (
              <Toast
                key={tone}
                tone={tone}
                title={COPY[tone].title}
                action={
                  tone === "earn" ? (
                    <Button variant="ghost" tone="lime" size="sm">
                      Undo
                    </Button>
                  ) : undefined
                }
                onDismiss={() => setDismissed((prev) => [...prev, tone])}
              >
                {COPY[tone].body}
              </Toast>
            ))}
          </div>
          {dismissed.length > 0 && (
            <Button
              variant="ghost"
              tone="cyan"
              size="sm"
              className="self-start"
              onClick={() => setDismissed([])}
            >
              Bring them back
            </Button>
          )}
        </div>

        <Row label="empty state">
          <div className="w-full max-w-md">
            <EmptyState
              icon="◈"
              title="No albums yet"
              description="Albums are yours to author. Build one, seal it, then earn your way through it."
              action={<Button tone="violet">Create an album</Button>}
            />
          </div>
        </Row>

        <div className="flex flex-col gap-3">
          <span className="font-numeric text-2xs text-ink-muted tracking-kicker uppercase">
            skeleton · text / block / card — card holds the 5:7 so the grid never reflows
          </span>
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton lines={4} />
            <Skeleton variant="block" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          </div>
        </div>
      </Panel>
    </Section>
  );
}
