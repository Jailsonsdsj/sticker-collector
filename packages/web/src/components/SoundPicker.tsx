import { useState } from "react";
import {
  loadSounds,
  playSoundId,
  SOUND_EVENTS,
  SOUNDS,
  type SoundEvent,
  type SoundId,
  saveSound,
} from "../lib/sounds";
import { SettingsPanel } from "./SettingsPanel";
import { Button } from "./ui";

/**
 * Choosing what the app says when something goes right.
 *
 * **Every change plays.** Picking a sound from a list without hearing it is
 * picking a name, and the names here — Blip, Thunk, Rise — mean nothing until
 * you have heard them once. The tap that chooses is also the tap that
 * demonstrates, which is the same gesture doing both jobs rather than a
 * separate preview button beside every row.
 *
 * That doubles as the browser's autoplay gesture: the audio context is created
 * on the first tap in here, so by the time a task is ticked it is awake.
 *
 * A `<select>` rather than the icon picker's radio row: there are seven sounds
 * and three events, and twenty-one radio buttons on a phone is a wall.
 */
export function SoundPicker() {
  const [chosen, setChosen] = useState<Record<SoundEvent, SoundId>>(loadSounds);

  const choose = (event: SoundEvent, id: SoundId) => {
    setChosen((current) => ({ ...current, [event]: id }));
    saveSound(event, id);
    playSoundId(id);
  };

  return (
    <SettingsPanel
      label="Sounds"
      title="Sounds"
      description="What the app plays when work lands. Every choice plays as you pick it, and “None” is always there."
    >
      <div className="flex flex-col gap-4">
        {SOUND_EVENTS.map((event) => (
          <div key={event.id} className="flex items-center gap-3">
            <label
              htmlFor={`sound-${event.id}`}
              className="flex-1 font-body text-sm text-ink-secondary"
            >
              {event.label}
            </label>

            <select
              id={`sound-${event.id}`}
              value={chosen[event.id]}
              onChange={(e) => choose(event.id, e.target.value)}
              className="rounded-lg border border-border bg-panel px-3 py-2 font-body text-sm text-ink"
            >
              {SOUNDS.map((sound) => (
                <option key={sound.id} value={sound.id}>
                  {sound.label}
                </option>
              ))}
            </select>

            {/* For hearing it again without changing anything — the select only
                fires on a *different* value, so re-picking the current one is
                silent. */}
            <Button
              variant="ghost"
              tone="cyan"
              size="sm"
              aria-label={`Play ${event.label} sound`}
              onClick={() => playSoundId(chosen[event.id])}
            >
              ▶
            </Button>
          </div>
        ))}
      </div>
    </SettingsPanel>
  );
}
