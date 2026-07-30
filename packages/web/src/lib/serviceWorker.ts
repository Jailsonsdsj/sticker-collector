/**
 * Service worker registration.
 *
 * The virtual module `virtual:pwa-register` only exists inside a Vite build, so
 * it is imported dynamically and behind a capability check — otherwise every
 * test that touches this file would need the plugin's build graph.
 *
 * Registration is deliberately *not* automatic-update. A worker that reloads the
 * page by itself can do it mid-tap; `UpdateToast` asks first.
 */
export interface SwHandlers {
  /** A new version is installed and waiting. */
  onUpdateReady: (activate: () => Promise<void>) => void;
  onOfflineReady?: () => void;
}

export async function registerServiceWorker(handlers: SwHandlers): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const { registerSW } = await import(/* @vite-ignore */ "virtual:pwa-register");
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        // `update(true)` activates the waiting worker and reloads.
        handlers.onUpdateReady(async () => {
          await update(true);
        });
      },
      onOfflineReady() {
        handlers.onOfflineReady?.();
      },
    });
  } catch {
    // No plugin in this context (a test, or a plain `vite preview` of an old
    // build). The app works; it simply has no offline copy.
  }
}
