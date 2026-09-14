/**
 * The sounds the app makes, and which one plays for what.
 *
 * **Synthesised, not sampled.** Every tone here is a few oscillators and an
 * envelope, built at the moment it plays — there are no audio files in the
 * repository and none over the network. Three reasons that is the right trade
 * for this app rather than a compromise:
 *
 *  - It is offline by construction. A PWA that has to precache four MP3s per
 *    choice is four more things the service worker can fail to have.
 *  - It costs nothing. The whole library below is smaller than one short WAV.
 *  - It cannot be silently wrong. A missing file plays nothing and reports
 *    nothing, which is indistinguishable from a user who chose "None".
 *
 * The cost is that these are chimes and blips rather than music. For a reward
 * that fires several times a day, a short clean tone is what you want anyway —
 * a fanfare is charming twice and then it is a reason to turn sound off.
 */

/** The three moments worth marking. */
export const SOUND_EVENTS = [
  { id: "taskDone", label: "Task done" },
  { id: "piece", label: "Puzzle piece" },
  { id: "sticker", label: "New sticker" },
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number]["id"];

/**
 * One note: a frequency, when it starts, how long it rings, and how loud.
 *
 * Times are seconds from the start of the sound. A tone is a list of these,
 * which is enough to write an arpeggio, a two-note chime or a single blip
 * without any of them needing their own code.
 */
interface Note {
  hz: number;
  at: number;
  seconds: number;
  gain?: number;
  wave?: OscillatorType;
  /**
   * Glide to this pitch over the note's length.
   *
   * A whole family of sounds is a *movement* rather than a pitch — a zap falls,
   * a pop rises — and writing those as a run of short fixed notes gives you a
   * staircase you can hear. One ramp is both cheaper and the actual effect.
   */
  toHz?: number;
}

export interface SoundDef {
  id: string;
  label: string;
  notes: Note[];
}

/** Equal temperament from A4, so the tones are in tune with each other. */
const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

const A4 = 0;
const C5 = 3;
const E5 = 7;
const G5 = 10;
const C6 = 15;
const E6 = 19;
const G4 = -2;
const A5 = 12;
const D6 = 17;
const G6 = 22;
const C7 = 27;
const E7 = 31;

/**
 * The library. `none` is first and is the default: an app that starts making
 * noise before being asked is an app people learn to mute.
 */
export const SOUNDS: SoundDef[] = [
  { id: "none", label: "None", notes: [] },
  {
    id: "blip",
    label: "Blip",
    notes: [{ hz: note(C6), at: 0, seconds: 0.08, wave: "square", gain: 0.18 }],
  },
  {
    id: "chime",
    label: "Chime",
    notes: [
      { hz: note(C5), at: 0, seconds: 0.35 },
      { hz: note(G5), at: 0.06, seconds: 0.35 },
    ],
  },
  {
    id: "coin",
    label: "Coin",
    notes: [
      { hz: note(E5), at: 0, seconds: 0.07, wave: "square", gain: 0.15 },
      { hz: note(E6), at: 0.07, seconds: 0.22, wave: "square", gain: 0.15 },
    ],
  },
  {
    id: "rise",
    label: "Rise",
    notes: [
      { hz: note(C5), at: 0, seconds: 0.12 },
      { hz: note(E5), at: 0.08, seconds: 0.12 },
      { hz: note(G5), at: 0.16, seconds: 0.28 },
    ],
  },
  {
    id: "fanfare",
    label: "Fanfare",
    notes: [
      { hz: note(G4), at: 0, seconds: 0.12, wave: "triangle" },
      { hz: note(C5), at: 0.1, seconds: 0.12, wave: "triangle" },
      { hz: note(E5), at: 0.2, seconds: 0.12, wave: "triangle" },
      { hz: note(G5), at: 0.3, seconds: 0.4, wave: "triangle" },
      { hz: note(C6), at: 0.3, seconds: 0.4, wave: "triangle", gain: 0.1 },
    ],
  },
  {
    id: "thunk",
    label: "Thunk",
    // 0.16 each, not 0.3. Two low sines struck together sum almost perfectly
    // — measured, this rendered at 0.52 against 0.15–0.26 for everything else,
    // so switching to it was a jump in volume rather than a change of sound.
    notes: [
      { hz: note(A4 - 12), at: 0, seconds: 0.16, wave: "sine", gain: 0.16 },
      { hz: note(A4 - 24), at: 0, seconds: 0.22, wave: "sine", gain: 0.16 },
    ],
  },
  {
    id: "bell",
    label: "Bell",
    // A fifth above the fundamental and a long decay: the two together are what
    // makes a struck bell rather than a held note.
    notes: [
      { hz: note(A5), at: 0, seconds: 0.9, gain: 0.22 },
      { hz: note(A5 + 7), at: 0, seconds: 0.7, gain: 0.1 },
    ],
  },
  {
    id: "pop",
    label: "Pop",
    notes: [{ hz: 400, toHz: 900, at: 0, seconds: 0.09, gain: 0.22 }],
  },
  {
    id: "drop",
    label: "Drop",
    notes: [{ hz: 900, toHz: 260, at: 0, seconds: 0.22, gain: 0.22 }],
  },
  {
    id: "zap",
    label: "Zap",
    notes: [{ hz: 1200, toHz: 180, at: 0, seconds: 0.18, wave: "sawtooth", gain: 0.12 }],
  },
  {
    id: "sparkle",
    label: "Sparkle",
    notes: [
      { hz: note(C6), at: 0, seconds: 0.09, wave: "triangle", gain: 0.14 },
      { hz: note(E6), at: 0.05, seconds: 0.09, wave: "triangle", gain: 0.14 },
      { hz: note(D6 + 12), at: 0.1, seconds: 0.09, wave: "triangle", gain: 0.12 },
      { hz: note(C6 + 12), at: 0.15, seconds: 0.22, wave: "triangle", gain: 0.12 },
    ],
  },
  {
    id: "twinkle",
    label: "Twinkle",
    /**
     * The one tune in the library, and it is still under a second.
     *
     * A run up the C major triad, a glint two octaves above the root, and a
     * held top note over a low one for the tail — a celesta figure rather than
     * a chime. "Sparkle" is a flick of four notes; this is the same idea given
     * a shape you could hum, which is the difference the picker is offering.
     *
     * It ends at exactly 1.0s because the guard on tone length is the whole
     * reason this library is chimes and blips: a reward that fires several
     * times a day is charming twice, and then it is a reason to turn sound off.
     * A song that outstays that is not a nicer version of this — it is the
     * thing the rest of the list exists to avoid. Long enough to be a melody,
     * short enough to still be a response.
     */
    notes: [
      { hz: note(C6), at: 0, seconds: 0.14, wave: "triangle", gain: 0.13 },
      { hz: note(E6), at: 0.08, seconds: 0.14, wave: "triangle", gain: 0.13 },
      { hz: note(G6), at: 0.16, seconds: 0.14, wave: "triangle", gain: 0.12 },
      { hz: note(C7), at: 0.24, seconds: 0.16, wave: "triangle", gain: 0.11 },
      { hz: note(E7), at: 0.34, seconds: 0.14, wave: "triangle", gain: 0.09 },
      { hz: note(C7), at: 0.44, seconds: 0.14, wave: "triangle", gain: 0.11 },
      { hz: note(G6), at: 0.54, seconds: 0.14, wave: "triangle", gain: 0.12 },
      // The two together are the tail: the top note is the one you hear, the
      // low one only stops it sounding thin on a phone speaker.
      { hz: note(C7), at: 0.64, seconds: 0.36, wave: "triangle", gain: 0.12 },
      { hz: note(C6), at: 0.64, seconds: 0.36, wave: "triangle", gain: 0.08 },
    ],
  },
  {
    id: "levelup",
    label: "Level up",
    notes: [
      { hz: note(C5), at: 0, seconds: 0.07, wave: "square", gain: 0.13 },
      { hz: note(E5), at: 0.07, seconds: 0.07, wave: "square", gain: 0.13 },
      { hz: note(G5), at: 0.14, seconds: 0.07, wave: "square", gain: 0.13 },
      { hz: note(C6), at: 0.21, seconds: 0.3, wave: "square", gain: 0.13 },
    ],
  },
  {
    id: "tada",
    label: "Ta-da",
    notes: [
      { hz: note(E5), at: 0, seconds: 0.14, wave: "triangle" },
      { hz: note(A5), at: 0.14, seconds: 0.5, wave: "triangle" },
      { hz: note(A5 + 4), at: 0.14, seconds: 0.5, wave: "triangle", gain: 0.1 },
    ],
  },
  {
    id: "woodblock",
    label: "Woodblock",
    // Nearly a click: 40ms is long enough to have a pitch and short enough to
    // read as a tap rather than a note.
    notes: [{ hz: note(C6 + 5), at: 0, seconds: 0.04, wave: "square", gain: 0.16 }],
  },
];

export type SoundId = string;

/** What each event plays until the user says otherwise. */
export const DEFAULT_SOUNDS: Record<SoundEvent, SoundId> = {
  taskDone: "chime",
  piece: "thunk",
  sticker: "coin",
};

const STORAGE_KEY = "sc_sounds";

/**
 * Stored on the device, not on the account.
 *
 * The same call `appIcon` makes, and for a stronger reason: whether this
 * machine should make noise is a fact about the machine and the room it is in.
 * A phone on a desk at work and a laptop at home want different answers, and
 * syncing would give them the same one. It also keeps this out of the backup,
 * where a preference has no business being.
 */
export function loadSounds(): Record<SoundEvent, SoundId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<Record<SoundEvent, unknown>>) : {};
    const known = new Set(SOUNDS.map((sound) => sound.id));

    // Field by field, and every one validated. A hand-edited or half-written
    // value must not take the whole preference down with it — an unknown id
    // falls back to the default rather than playing nothing for ever.
    const out = { ...DEFAULT_SOUNDS };
    for (const event of SOUND_EVENTS) {
      const value = stored[event.id];
      if (typeof value === "string" && known.has(value)) out[event.id] = value;
    }
    return out;
  } catch {
    return { ...DEFAULT_SOUNDS };
  }
}

export function saveSound(event: SoundEvent, id: SoundId): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSounds(), [event]: id }));
  } catch {
    // A device with storage blocked still plays sounds this session.
  }
}

/**
 * One `AudioContext`, made on first use and never before.
 *
 * Constructing one at import time gets it created `suspended` by every browser
 * with an autoplay policy, and on Safari counts against the page whether or not
 * a sound is ever played. Every caller here is downstream of a tap, which is
 * the gesture the policy is waiting for.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  // Resumed on every play: a context started before the first gesture stays
  // suspended, and one the OS suspended in the background never wakes itself.
  if (context.state === "suspended") void context.resume();
  return context;
}

export function soundById(id: SoundId): SoundDef | undefined {
  return SOUNDS.find((sound) => sound.id === id);
}

/**
 * Plays one sound, now.
 *
 * Silent and uncomplaining when it cannot: no Web Audio, storage blocked, a
 * context the browser refuses to resume. A reward sound is the last thing that
 * should be able to break the thing it is rewarding, so every failure here ends
 * as quiet rather than as an exception on the completion path.
 */
export function playSoundId(id: SoundId): void {
  const def = soundById(id);
  if (!def || def.notes.length === 0) return;

  try {
    const ctx = audio();
    if (!ctx) return;

    const now = ctx.currentTime;
    for (const n of def.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.wave ?? "sine";
      osc.frequency.value = n.hz;

      // An envelope, not a switch. A gain that jumps to full and back leaves a
      // click at each end — the discontinuity is audible and sounds like a
      // fault rather than a note.
      const peak = n.gain ?? 0.2;
      const start = now + n.at;

      // The glide, when the note is a movement rather than a pitch. Exponential
      // because pitch is heard logarithmically — a linear sweep spends most of
      // its time in the top octave and arrives with a lurch.
      if (n.toHz !== undefined) {
        // `setValueAtTime` first, to anchor where the ramp BEGINS. A ramp with
        // no preceding event runs from the last scheduled value — which is
        // context time zero — so a glide on a delayed note would already be
        // part-way down by the time it sounded. Every glide here starts at 0
        // today and would survive without this; the note that does not is the
        // one nobody would think to check.
        osc.frequency.setValueAtTime(n.hz, start);
        osc.frequency.exponentialRampToValueAtTime(n.toHz, start + n.seconds);
      }
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.seconds);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + n.seconds + 0.02);
    }
  } catch {
    // Quiet is an acceptable outcome; a thrown error on the tick path is not.
  }
}

/** Plays whatever the user chose for this event. */
export function playSound(event: SoundEvent): void {
  playSoundId(loadSounds()[event]);
}
