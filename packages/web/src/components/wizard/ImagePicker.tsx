import type { ImageKind, Size } from "@sticker-collector/shared";
import { useRef, useState } from "react";
import { uploadImage } from "../../lib/imageUpload";
import { ImageCropper } from "../ImageCropper";
import { Button, Sheet } from "../ui";

export interface ImagePickerProps {
  kind: ImageKind;
  label: string;
  /** The stored image's key once the bytes are safely uploaded, and the size
   *  they were stored at. A caller that only wants the key can ignore it. */
  onPicked: (imageKey: string, size: Size) => void;
  disabled?: boolean;
  /**
   * Import a batch: pick several files, then position them one after another.
   *
   * `onPicked` still fires once per image, as each is positioned — the caller
   * never learns that a batch was involved.
   */
  multiple?: boolean;
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
 *
 * **A batch is positioned one image at a time, and decoded one image at a
 * time.** Only the current file is turned into an `ImageBitmap`; the rest sit
 * as `File` handles, which are references to bytes on disk rather than pixels
 * in memory. A dozen 12MP photos decoded at once is tens of gigabytes of RGBA
 * and a dead tab on a phone — the same reason the backup export fetches its
 * images in sequence rather than all at once.
 */
export function ImagePicker({
  kind,
  label,
  onPicked,
  disabled,
  multiple = false,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = queue[index] ?? null;
  const last = index === queue.length - 1;

  const close = () => {
    setQueue([]);
    setIndex(0);
  };

  const commit = async (bytes: Uint8Array, size: Size) => {
    setBusy(true);
    setError(null);
    try {
      const { key } = await uploadImage(bytes, kind);
      onPicked(key, size);
      // Advance, or finish. Stepping Back and re-positioning an earlier image
      // adds it again rather than replacing it — content addressing makes the
      // re-upload free, and the caller can drop the one it does not want.
      if (last) close();
      else setIndex(index + 1);
    } catch (cause) {
      // Nothing is added: a draft entry pointing at bytes that were never
      // stored would fail at seal, long after the cause is visible.
      setError(cause instanceof Error ? cause.message : "That image could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const heading = kind === "cover" ? "Position the cover" : "Position the sticker";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        aria-label={label}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (picked.length > 0) {
            setQueue(picked);
            setIndex(0);
          }
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
        open={current !== null}
        onClose={close}
        title={queue.length > 1 ? `${heading} ${index + 1} of ${queue.length}` : heading}
      >
        {current && (
          <ImageCropper
            // Keyed by position: moving between images must reset the crop and
            // re-decode, not reuse the previous picture's state.
            key={`${index}-${current.name}-${current.lastModified}`}
            file={current}
            kind={kind}
            commitLabel={queue.length > 1 ? (last ? "Done" : "Next") : undefined}
            onBack={index > 0 ? () => setIndex(index - 1) : undefined}
            onCommit={(bytes, size) => void commit(bytes, size)}
            onCancel={close}
          />
        )}
      </Sheet>
    </>
  );
}
