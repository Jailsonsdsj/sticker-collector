/**
 * Getting a sticker out of the app and onto the device.
 *
 * Two paths, in this order, because the app's home is an installed iOS PWA:
 *
 * 1. **The share sheet**, when the browser can share files. On iOS this is the
 *    only route to the photo library — it is what puts "Save Image" in front of
 *    the user. An `<a download>` there tends to open the picture in a new view
 *    instead of saving it.
 * 2. **An `<a download>` on a blob URL** everywhere else. Desktop browsers save
 *    straight to disk, which is what a download button means there.
 *
 * A blob rather than the URL itself in both cases: the share sheet needs actual
 * bytes, and a content-addressed URL would otherwise save the file as
 * `<sha256>.jpg` — a name that says nothing about which sticker it is.
 */
import { imageSrc } from "./imageUpload";

/** Fired at the user, so the failure has to be sayable. */
export class SaveImageError extends Error {}

export async function saveSticker(imageKey: string, title?: string | null): Promise<void> {
  const response = await fetch(imageSrc(imageKey), { credentials: "same-origin" });
  if (!response.ok) throw new SaveImageError("The image could not be downloaded.");

  const blob = await response.blob();
  const name = `${fileStem(title) || "sticker"}.jpg`;
  const file = new File([blob], name, { type: blob.type || "image/jpeg" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title ?? "Sticker" });
      return;
    } catch (cause) {
      // Dismissing the share sheet is a decision, not a failure — falling
      // through to a download would save the file they just declined to save.
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      // Anything else (no handler, a share that threw): the link still works.
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Revoked on the next tick: revoking synchronously can beat the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filename the user could find again, without the punctuation a filesystem
 *  argues about. */
function fileStem(title?: string | null): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
