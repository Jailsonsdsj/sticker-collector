import { useState } from "react";
import {
  APP_ICONS,
  type AppIconId,
  appIconSrc,
  applyAppIcon,
  loadAppIcon,
  saveAppIcon,
} from "../lib/appIcon";
import { cx } from "./ui/cx";

/**
 * Choosing the app's icon.
 *
 * A radio group rather than four buttons: these are one choice with four
 * answers, and the arrow keys should move between them the way they do in every
 * other set of options.
 *
 * The panel is honest about the one thing that surprises people — an icon
 * already on an iOS home screen does not change. Saying nothing there would
 * leave the user tapping an option that visibly does nothing.
 */
export function AppIconPicker() {
  const [chosen, setChosen] = useState<AppIconId>(loadAppIcon);

  const choose = (id: AppIconId) => {
    setChosen(id);
    saveAppIcon(id);
    // Immediately, so the tab icon changes under the user's hand rather than
    // at some later reload they will not connect to this tap.
    applyAppIcon(id);
  };

  return (
    <section aria-label="App icon" className="mb-5 rounded-3xl border border-border bg-panel p-5">
      <h2 className="font-display text-xl tracking-display uppercase italic">App icon</h2>
      <p className="mt-1 font-body text-sm text-ink-secondary">
        The icon this app wears on your home screen and in the browser tab.
      </p>

      {/* The inputs share a `name`, which is what makes them one choice; the
          group's own label is the section heading above. */}
      <div className="mt-4 flex flex-wrap gap-4">
        {APP_ICONS.map((icon) => {
          const selected = icon.id === chosen;
          return (
            // A real <input type="radio">, hidden and styled through its label:
            // the arrow keys, the roving focus and the group semantics all come
            // free, and none of them survive a set of buttons wearing
            // role="radio".
            <label
              key={icon.id}
              className={cx(
                "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-2",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan",
                selected ? "border-cyan" : "border-transparent",
              )}
            >
              <input
                type="radio"
                className="peer sr-only"
                name="app-icon"
                value={icon.id}
                checked={selected}
                onChange={() => choose(icon.id)}
              />
              <img
                src={appIconSrc(icon.id, 192)}
                alt=""
                // Chosen at 192 and drawn at 64: the home screen renders it far
                // larger than this preview, and a 32 blown up would sell every
                // option short.
                className="size-16 rounded-2xl"
                draggable={false}
              />
              <span
                className={cx(
                  "font-body text-2xs",
                  selected ? "font-bold text-ink" : "text-ink-secondary",
                )}
              >
                {icon.label}
              </span>
            </label>
          );
        })}
      </div>

      <p className="mt-4 font-body text-2xs text-ink-muted">
        Already added to your home screen? iOS copies the icon when you add the app and never looks
        again — remove it and add it once more to pick this one up.
      </p>
    </section>
  );
}
