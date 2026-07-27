import { useState } from "react";
import { Button, Dialog, Input, Sheet, Tabs } from "../../components/ui";
import { Panel, Row, Section } from "../Section";

type Open = null | "sheet" | "wizard" | "dialog" | "danger";

const TYPE_TABS = [
  { value: "routine" as const, label: "↻ Routine", tone: "violet" as const },
  { value: "oneoff" as const, label: "· One-off", tone: "cyan" as const },
];

export function Overlays() {
  const [open, setOpen] = useState<Open>(null);
  const [type, setType] = useState<"routine" | "oneoff">("routine");
  const [typed, setTyped] = useState("");
  const close = () => setOpen(null);

  return (
    <Section n="12" title="Sheet & Dialog">
      <Panel>
        <Row label="open one — Escape, backdrop click and the close button all work">
          <Button onClick={() => setOpen("sheet")}>Task form</Button>
          <Button tone="violet" onClick={() => setOpen("wizard")}>
            Wizard (with toolbar)
          </Button>
          <Button tone="neutral" onClick={() => setOpen("dialog")}>
            Dialog
          </Button>
          <Button tone="magenta" onClick={() => setOpen("danger")}>
            Dialog · danger
          </Button>
        </Row>

        <p className="font-body text-md text-ink-secondary">
          Both sit on a native <code className="font-numeric text-cyan">&lt;dialog&gt;</code>, so
          focus is trapped, the page behind is inert, and stacking never needs a z-index.
        </p>
      </Panel>

      <Sheet
        open={open === "sheet"}
        onClose={close}
        title="New task"
        leading={
          <Button variant="ghost" tone="neutral" size="sm" onClick={close}>
            Cancel
          </Button>
        }
        trailing={
          <Button tone="lime" size="sm" onClick={close}>
            Save
          </Button>
        }
      >
        <Input id="sheet-title" label="Title" required placeholder="What needs doing?" />
        <Tabs items={TYPE_TABS} value={type} onChange={setType} label="Task type" />
        <Input
          id="sheet-effort"
          tone="coin"
          label="Reward (coins)"
          hint="matches effort"
          defaultValue="30"
        />
      </Sheet>

      <Sheet
        open={open === "wizard"}
        onClose={close}
        title="Create album"
        leading={
          <Button variant="ghost" tone="neutral" size="sm" onClick={close}>
            Cancel
          </Button>
        }
        toolbar={
          <div className="flex gap-2">
            {["START", "ART", "TIERS", "PRICES", "SEAL"].map((step, i) => (
              <div key={step} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`h-1 w-full rounded-full ${i <= 1 ? "bg-violet" : "bg-surface-3"}`}
                />
                <span className="font-numeric text-3xs text-ink-dim tracking-section">{step}</span>
              </div>
            ))}
          </div>
        }
      >
        <p className="font-body text-md text-ink-secondary">
          The toolbar slot holds the stepper. Only this body scrolls.
        </p>
      </Sheet>

      <Dialog
        open={open === "dialog"}
        onClose={close}
        title="Keep collecting?"
        footer={
          <>
            <Button variant="outline" tone="neutral" onClick={close}>
              Close
            </Button>
            <Button tone="coin" onClick={close}>
              Export PDF
            </Button>
          </>
        }
      >
        Every slot is filled. The export stays available forever — you can come back to it.
      </Dialog>

      <Dialog
        open={open === "danger"}
        onClose={close}
        tone="danger"
        title="Delete album?"
        footer={
          <>
            <Button variant="outline" tone="neutral" onClick={close}>
              Cancel
            </Button>
            <Button
              tone="magenta"
              disabled={typed.trim().toLowerCase() !== "cidades"}
              onClick={close}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p>
            This is destructive. You lose <strong className="text-ink">Cidades</strong>, every
            sticker bought inside it, and the right to export it.{" "}
            <span className="text-prio-high-fg">Nothing is refunded.</span>
          </p>
          <Input
            id="dialog-confirm"
            tone="danger"
            label="Type Cidades to confirm"
            placeholder="Cidades"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
      </Dialog>
    </Section>
  );
}
