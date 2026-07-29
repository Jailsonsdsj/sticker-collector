import type { ImageKind } from "@sticker-collector/shared";
import { useRef, useState } from "react";
import { uploadImage } from "../../lib/imageUpload";
import { ImageCropper } from "../ImageCropper";
import { Button, Sheet } from "../ui";

export interface ImagePickerProps {
  kind: ImageKind;
  label: string;
  /** Called with the stored image's key once the bytes are safely uploaded. */
  onPicked: (imageKey: string) => void;
  disabled?: boolean;
}

/**
 * File → crop → upload → key, in one place.
 *
 * The upload happens **here**, at import time, not at seal time. That is what
 * lets the draft hold keys instead of megabytes of blobs, and what makes a
 * refresh mid-wizard cheap to recover from. Content addressing pays for it:
 * picking the same picture twice uploads nothing the second time.
 *
 * The key only reaches the draft after the bytes are stored, so a draft can
 * never reference an image the server does not have.
 */
export function ImagePicker({ kind, label, onPicked, disabled }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async (bytes: Uint8Array) => {
    setBusy(true);
    setError(null);
    try {
      const { key } = await uploadImage(bytes);
      onPicked(key);
      setFile(null);
    } catch (cause) {
      // The sticker is not added: a draft entry pointing at bytes that were
      // never stored would fail at seal, long after the cause is visible.
      setError(cause instanceof Error ? cause.message : "That image could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={label}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) setFile(picked);
          // Cleared so picking the same file again still fires a change event.
          event.target.value = "";
        }}
      />

      <Button
        variant="outline"
        tone="cyan"
        disabled={disabled || busy}
        loading={busy}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>

      {error && (
        <p role="alert" className="font-body text-sm text-magenta">
          {error}
        </p>
      )}

      <Sheet
        open={file !== null}
        onClose={() => setFile(null)}
        title={kind === "cover" ? "Position the cover" : "Position the sticker"}
      >
        {file && (
          <ImageCropper
            file={file}
            kind={kind}
            onCommit={(bytes) => void commit(bytes)}
            onCancel={() => setFile(null)}
          />
        )}
      </Sheet>
    </>
  );
}
