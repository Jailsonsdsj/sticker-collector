import { type RefObject, useEffect, useRef } from "react";

/**
 * Drives a native <dialog> from an `open` prop.
 *
 * showModal() is doing real work here: focus trap, Escape-to-close, top-layer
 * stacking above every z-index, and `inert` on the rest of the page. All of it
 * is behaviour the prototype has no answer for and hand-rolled overlays get
 * wrong — so Sheet and Dialog both sit on it rather than on a positioned div.
 */
export function useModal(open: boolean, onClose?: () => void): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onClose) return;
    // Fires for Escape and for close() alike, so state stays in step either way.
    const handle = () => onClose();
    el.addEventListener("close", handle);
    return () => el.removeEventListener("close", handle);
  }, [onClose]);

  return ref;
}

/** Clicking the backdrop closes: the target is the dialog itself, not its panel. */
export function backdropClose(onClose?: () => void) {
  return (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose?.();
  };
}
