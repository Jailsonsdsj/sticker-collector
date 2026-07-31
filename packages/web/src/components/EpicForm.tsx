import { EPIC_ACCENTS, type Epic, type EpicAccent } from "@sticker-collector/shared";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Button, Chip, Field, Input, Sheet, Textarea } from "./ui";

/**
 * Create or rename an epic. The same sheet does both — an epic is a title and
 * an accent, and there is nothing to edit that is not also set at creation.
 *
 * The accent is a **token name**, never a colour: `epicAccentSchema` rejects a
 * hex, which keeps literal colours out of the database and out of components.
 */
/** The whole palette, from the schema — a picker that lists fewer than the
 *  schema accepts is a colour nobody can choose. */
export const ACCENTS: EpicAccent[] = [...EPIC_ACCENTS];

export interface EpicFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    description: string | null;
    accent: EpicAccent;
  }) => Promise<unknown>;
  /** Present when renaming rather than creating. */
  epic?: Epic | null;
}

export function EpicForm({ open, onClose, onSubmit, epic }: EpicFormProps) {
  const [title, setTitle] = useState(epic?.title ?? "");
  const [description, setDescription] = useState(epic?.description ?? "");
  const [accent, setAccent] = useState<EpicAccent>(epic?.accent ?? "epic-1");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reopening on a different epic must not show the last one's answers.
  useEffect(() => {
    if (!open) return;
    setTitle(epic?.title ?? "");
    setDescription(epic?.description ?? "");
    setAccent(epic?.accent ?? "epic-1");
    setFailed(false);
  }, [open, epic]);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      // Trimmed to null: an empty box means the author wrote nothing, and ""
      // would make "no description" and "a blank one" the same row.
      await onSubmit({ title: title.trim(), description: description.trim() || null, accent });
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={epic ? "Edit epic" : "New epic"}
      leading={
        <Button variant="ghost" tone="neutral" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
      trailing={
        <Button tone="lime" size="sm" disabled={!title.trim() || saving} onClick={save}>
          Save
        </Button>
      }
    >
      <Input
        id="epic-title"
        label="Title"
        required
        placeholder="What is this group of work?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <Textarea
        id="epic-description"
        label="Description"
        hint="optional"
        placeholder="What counts as done, or why this matters"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <Field label="Accent">
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((option) => (
            <Chip
              key={option}
              aria-label={option}
              shape="rounded"
              selected={accent === option}
              onClick={() => setAccent(option)}
              style={{ "--ui-accent": `var(--color-${option})` } as CSSProperties}
            >
              <span
                aria-hidden
                className="size-3 rounded-xs"
                style={{ background: `var(--color-${option})` }}
              />
            </Chip>
          ))}
        </div>
      </Field>

      {failed && (
        <p role="alert" className="font-body text-sm text-prio-high-fg">
          Could not save. Try again.
        </p>
      )}
    </Sheet>
  );
}
