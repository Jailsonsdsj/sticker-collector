/**
 * Which icon the app wears.
 *
 * **What this can and cannot change.** The link tags below are what a browser
 * reads when it installs the app, so picking an icon changes the one the *next*
 * install gets — and, immediately, the tab icon and everything the app draws of
 * itself. It does **not** repaint an icon already sitting on an iOS home
 * screen: iOS copies the artwork at "Add to Home Screen" and never looks again.
 * Re-adding the app is the only way to change that one, and the picker says so
 * rather than leaving the user tapping a choice that appears to do nothing.
 *
 * **Stored on the device, not on the server.** The home-screen icon belongs to
 * the device that installed it — syncing it would push one phone's choice onto
 * another phone's home screen, where it cannot take effect anyway.
 */
export const APP_ICONS = [
  { id: "star", label: "Star" },
  { id: "coin", label: "Coin" },
  { id: "sticker-pink", label: "Pink sticker" },
  { id: "sticker-violet", label: "Violet sticker" },
] as const;

export type AppIconId = (typeof APP_ICONS)[number]["id"];

/** The star: the shape the app already uses for a sticker slot. */
export const DEFAULT_APP_ICON: AppIconId = "star";

const STORAGE_KEY = "sc_app_icon";

/** The sizes shipped per icon. 512 installs, 180 is iOS, 32 is the tab. */
export type AppIconSize = 32 | 180 | 192 | 512;

export function appIconSrc(id: AppIconId, size: AppIconSize): string {
  return `/app-icons/${id}/icon-${size}.png`;
}

export function loadAppIcon(): AppIconId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return APP_ICONS.some((icon) => icon.id === stored) ? (stored as AppIconId) : DEFAULT_APP_ICON;
  } catch {
    // Private mode, or storage disabled. An icon is not worth a crash.
    return DEFAULT_APP_ICON;
  }
}

export function saveAppIcon(id: AppIconId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // As above: the choice simply does not survive a reload.
  }
}

/**
 * Points the document's icon links at the chosen set.
 *
 * Rewritten rather than added: a second `apple-touch-icon` link does not
 * override the first, and iOS picks whichever it likes from a list.
 */
export function applyAppIcon(id: AppIconId, doc: Document = document): void {
  const set = (selector: string, href: string) => {
    const link = doc.querySelector<HTMLLinkElement>(selector);
    if (link) link.href = href;
  };

  set('link[rel="apple-touch-icon"]', appIconSrc(id, 180));
  set('link[rel="icon"]', appIconSrc(id, 32));
  // The manifest carries the 192/512 an Android or desktop install uses, so it
  // has to move too — one file per icon, differing only in `icons`.
  set('link[rel="manifest"]', `/app-icons/${id}/manifest.webmanifest`);
}
