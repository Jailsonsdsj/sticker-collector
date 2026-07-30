import { useEffect, useState } from "react";
import { registerServiceWorker } from "../lib/serviceWorker";
import { Toast, ToastViewport } from "./ui";

export interface UpdateToastProps {
  /** Injected in tests; the real one talks to the service worker. */
  register?: typeof registerServiceWorker;
}

/**
 * Offers a new version rather than imposing it.
 *
 * A worker that activates by itself reloads the page whenever it likes —
 * including mid-tap, mid-form, mid-crop. This asks. Until the user answers, the
 * running version keeps working, which is the whole point of the waiting state.
 */
export function UpdateToast({ register = registerServiceWorker }: UpdateToastProps) {
  const [activate, setActivate] = useState<(() => Promise<void>) | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void register({
      onUpdateReady: (run) => {
        // Wrapped in a thunk: a bare function passed to setState would be
        // called as an updater instead of stored.
        setActivate(() => run);
      },
    });
  }, [register]);

  if (!activate || dismissed) return null;

  return (
    <ToastViewport>
      <Toast
        tone="neutral"
        title="A new version is ready"
        onDismiss={() => setDismissed(true)}
        action={
          <button
            type="button"
            className="font-body text-sm font-bold text-cyan"
            onClick={() => void activate()}
          >
            Reload
          </button>
        }
      >
        Reload when you are at a good stopping point — nothing is lost either way.
      </Toast>
    </ToastViewport>
  );
}
