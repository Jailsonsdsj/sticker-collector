import { type FormEvent, useState } from "react";
import { Button, Input } from "./ui";

/**
 * One field, no form, no navigation.
 *
 * The server decides what a quick-add is; this only carries a title. Two rules
 * matter more than they look:
 *
 *  - a failed submit **keeps the text**. Losing what someone just typed because
 *    the network blipped is the worst outcome this component has;
 *  - it is disabled while in flight, so a double-tap cannot become two tasks —
 *    each submission carries its own idempotency key, so the server would
 *    honour both.
 */
export interface QuickAddProps {
  onAdd: (title: string) => Promise<unknown>;
  pending?: boolean;
}

export function QuickAdd({ onAdd, pending = false }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [failed, setFailed] = useState(false);

  const trimmed = title.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || pending) return;

    setFailed(false);
    try {
      await onAdd(trimmed);
      setTitle("");
    } catch {
      setFailed(true); // the text stays put
    }
  }

  return (
    <form onSubmit={submit} className="mb-5">
      <div className="flex items-start gap-2">
        {/* The error is rendered here rather than passed to Input's `error`
            slot: Input switches between a bare <input> and a <Field>-wrapped
            one, and that change of tree shape remounts the field, throwing away
            focus and the caret mid-typing. See TD-12. */}
        <Input
          id="quick-add"
          className="flex-1"
          placeholder="Quick-add a one-off…"
          aria-label="Quick-add a one-off"
          aria-invalid={failed || undefined}
          value={title}
          disabled={pending}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          type="submit"
          tone="lime"
          // The glyph is 30px tall, so the size's own `py-3` pushes the button
          // taller than the input beside it. Trimmed inline rather than by
          // class: both are plain padding utilities, so which one wins is
          // decided by Tailwind's stylesheet order, not by the class attribute.
          style={{ paddingBlock: "var(--space-2)" }}
          aria-label="Add task"
          disabled={!trimmed || pending}
          loading={pending}
        >
          {/* The glyph carries the button, not the padding: a "+" at body size
              reads as a small control however wide the button is. `leading-none`
              keeps the taller glyph from growing the button around it. */}
          <span aria-hidden className="text-3xl leading-none">
            +
          </span>
        </Button>
      </div>
      {failed && (
        <p role="alert" className="mt-2 font-body text-sm text-prio-high-fg">
          Could not save. Try again.
        </p>
      )}
    </form>
  );
}
