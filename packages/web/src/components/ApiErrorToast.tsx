import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { type ApiErrorEntry, onError } from "../lib/errorLog";
import { Button, Toast, ToastViewport } from "./ui";

/**
 * The popup a failed request raises.
 *
 * A toast rather than a dialog: a request can fail while the user is mid-tap,
 * and a modal that steals focus turns one failure into two problems. This says
 * what broke, offers the log, and gets out of the way.
 *
 * **A 401 is never shown.** An expired session already redirects to the login
 * screen; announcing it as an error on the way is noise about something the app
 * is handling.
 *
 * One at a time, newest wins. Five failed requests in a burst — which is what a
 * dropped connection looks like — is one problem, not five toasts.
 */
const DISMISS_MS = 6000;

export function ApiErrorToast() {
  const [shown, setShown] = useState<ApiErrorEntry | null>(null);
  const navigate = useNavigate();

  useEffect(
    () =>
      onError((entries) => {
        const latest = entries[0];
        if (!latest || latest.status === 401) return;
        setShown(latest);
      }),
    [],
  );

  useEffect(() => {
    if (!shown) return;
    // Keyed by the entry, so a second failure restarts the clock rather than
    // inheriting the first one's remaining time.
    const timer = window.setTimeout(() => setShown(null), DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;

  return (
    <ToastViewport>
      <Toast
        tone="danger"
        title="Something did not go through"
        onDismiss={() => setShown(null)}
        action={
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            onClick={() => {
              setShown(null);
              navigate("/settings");
            }}
          >
            Details
          </Button>
        }
      >
        {describe(shown)}
      </Toast>
    </ToastViewport>
  );
}

/** Plain enough to act on, specific enough to report. */
export function describe(entry: ApiErrorEntry): string {
  if (entry.status === 0) return "No connection. The change was not saved.";
  if (entry.status === 402) return "Not enough coins for that.";
  if (entry.status === 409) return "That had already changed. Try again.";
  if (entry.status >= 500) return "The server had a problem. Nothing was saved.";
  return entry.message;
}
