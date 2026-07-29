import type { AlbumDraft, DraftAction, DraftProblems } from "../../lib/albumDraft";
import { imageSrc } from "../../lib/imageUpload";
import { Input, Textarea } from "../ui";
import { ImagePicker } from "./ImagePicker";

export interface StepProps {
  draft: AlbumDraft;
  problems: DraftProblems;
  dispatch: (action: DraftAction) => void;
}

/** Title, description and the cover — the three things an album is recognised by. */
export function DetailsStep({ draft, problems, dispatch }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <Input
        id="album-title"
        label="Title"
        required
        value={draft.title}
        error={problems.title}
        onChange={(event) => dispatch({ type: "field", field: "title", value: event.target.value })}
      />

      <Textarea
        id="album-description"
        label="Description"
        hint="Optional"
        rows={3}
        value={draft.description}
        onChange={(event) =>
          dispatch({ type: "field", field: "description", value: event.target.value })
        }
      />

      <div className="flex flex-col gap-2">
        <span className="font-body text-2xs tracking-kicker text-ink-muted uppercase">Cover</span>

        {draft.coverKey ? (
          <img
            src={imageSrc(draft.coverKey)}
            alt="Album cover"
            className="w-40 rounded-2xl border border-border object-cover"
            style={{ aspectRatio: "var(--aspect-card)" }}
          />
        ) : (
          <p className="font-body text-sm text-ink-dim">
            The cover is cropped to 5:7 and lands on A5 when the album is printed.
          </p>
        )}

        <div className="flex flex-col items-start gap-2">
          <ImagePicker
            kind="cover"
            label={draft.coverKey ? "Replace cover" : "Choose cover"}
            onPicked={(imageKey) => dispatch({ type: "cover", imageKey })}
          />
          {problems.coverKey && (
            <p className="font-body text-sm text-magenta">{problems.coverKey}</p>
          )}
        </div>
      </div>
    </div>
  );
}
