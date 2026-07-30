import { useEffect, useState } from "react";
import { Button } from "./ui";

/**
 * The nudge to install, on the two platforms that handle it entirely
 * differently.
 *
 * Chrome and Android fire `beforeinstallprompt`, which must be captured and
 * replayed on a tap — the browser refuses a `prompt()` that is not a response to
 * a gesture. **iOS Safari never fires it at all**, and there is no API to open
 * the share sheet, so the only honest thing there is to say where the button is.
 *
 * Neither appears once the app is already installed, and a dismissal is
 * remembered: a nag that returns every launch is worse than no nudge at all.
 */
const DISMISSED_KEY = "sc_install_dismissed";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");
  const [standalone] = useState(() => isStandalone());
  const [ios] = useState(() => isIosSafari());

  useEffect(() => {
    const onPrompt = (raw: Event) => {
      // Held rather than fired: the browser only honours `prompt()` from a
      // gesture, and it also stops Chrome showing its own mini-infobar.
      raw.preventDefault();
      setEvent(raw as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const hide = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  // Already installed, already dismissed, or a browser with nothing to offer.
  if (standalone || dismissed) return null;
  if (!event && !ios) return null;

  return (
    <aside
      aria-label="Install this app"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-cyan bg-panel p-3"
    >
      <p className="flex-1 font-body text-sm text-ink-secondary">
        {ios ? (
          <>
            Add this to your home screen: tap <span className="font-bold text-ink">Share</span>,
            then <span className="font-bold text-ink">Add to Home Screen</span>. It then opens like
            an app, without the browser bar.
          </>
        ) : (
          <>Install it and it opens like an app, without the browser bar.</>
        )}
      </p>

      {event && (
        <Button
          size="sm"
          tone="cyan"
          onClick={async () => {
            await event.prompt();
            // Whatever the user chose, the event is single-use.
            setEvent(null);
            hide();
          }}
        >
          Install
        </Button>
      )}

      <Button variant="ghost" tone="neutral" size="sm" onClick={hide}>
        Not now
      </Button>
    </aside>
  );
}

/** True once launched from the home screen — where a nudge would be nonsense. */
function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/**
 * iOS Safari, where installing is a manual gesture.
 *
 * Chrome and Firefox on iOS are also WebKit, and also cannot install — the
 * instruction is wrong for them, but the alternative is user-agent archaeology
 * for a hint that costs nothing to ignore.
 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  return isIos && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
