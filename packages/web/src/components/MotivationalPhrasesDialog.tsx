import { PHRASE_MAX_LENGTH, type Phrase } from "@sticker-collector/shared";
import { type FormEvent, useState } from "react";
import { useAddPhrase, useRemovePhrase } from "../lib/motivationalPhrases";
import { Button, Dialog, Input } from "./ui";

export interface MotivationalPhrasesDialogProps {
  open: boolean;
  phrases: Phrase[];
  onClose: () => void;
}

/** Add or remove the phrases that rotate on the home screen. */
export function MotivationalPhrasesDialog({
  open,
  phrases,
  onClose,
}: MotivationalPhrasesDialogProps) {
  const [draft, setDraft] = useState("");
  const add = useAddPhrase();
  const remove = useRemovePhrase();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (text === "") return;
    // Cleared only once saved, so a failed request does not eat what was typed.
    // The failure itself is surfaced by the app-wide API error toast.
    try {
      await add.mutateAsync({ text });
      setDraft("");
    } catch {
      // Keep the draft for a retry.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Motivational phrases"
      size="lg"
      footer={
        <Button variant="outline" tone="neutral" onClick={onClose}>
          Done
        </Button>
      }
    >
      <form onSubmit={submit} className="mb-4 flex items-center gap-2">
        <Input
          aria-label="New phrase"
          placeholder="Add a phrase…"
          autoComplete="off"
          maxLength={PHRASE_MAX_LENGTH}
          className="flex-1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" size="sm" loading={add.isPending} disabled={draft.trim() === ""}>
          Add
        </Button>
      </form>

      {phrases.length === 0 ? (
        <p className="text-ink-dim">No phrases yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {phrases.map((phrase) => (
            <li
              key={phrase.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2"
            >
              <span className="min-w-0 flex-1 break-words text-ink">{phrase.text}</span>
              <Button
                variant="ghost"
                tone="magenta"
                size="sm"
                aria-label={`Remove “${phrase.text}”`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(phrase.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
