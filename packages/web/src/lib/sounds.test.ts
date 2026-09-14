import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SOUNDS,
  loadSounds,
  playSound,
  playSoundId,
  SOUND_EVENTS,
  SOUNDS,
  saveSound,
  soundById,
} from "./sounds";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("the library", () => {
  it("offers silence, and offers it first", () => {
    // An app that starts making noise before being asked is an app people
    // learn to mute wholesale.
    expect(SOUNDS[0]?.id).toBe("none");
    expect(SOUNDS[0]?.notes).toEqual([]);
  });

  it("gives every sound a distinct id", () => {
    expect(new Set(SOUNDS.map((s) => s.id)).size).toBe(SOUNDS.length);
  });

  it("names every sound, since a picker shows names and not waveforms", () => {
    for (const sound of SOUNDS) expect(sound.label.length).toBeGreaterThan(0);
  });

  it("keeps every tone short enough to be a response and not an event", () => {
    // A reward that fires several times a day is charming twice and then it is
    // a reason to turn sound off.
    for (const sound of SOUNDS) {
      const end = Math.max(0, ...sound.notes.map((n) => n.at + n.seconds));
      expect(end).toBeLessThanOrEqual(1);
    }
  });

  it("gives every sound a distinct label, since the list is read not heard", () => {
    expect(new Set(SOUNDS.map((s) => s.label)).size).toBe(SOUNDS.length);
  });

  it("keeps every note audible — no silent or clipping gains", () => {
    // A gain of 0 is a sound that does nothing and reports nothing; above 1 it
    // clips, and several notes at once clip well below that.
    for (const sound of SOUNDS) {
      for (const n of sound.notes) {
        const gain = n.gain ?? 0.2;
        expect(gain).toBeGreaterThan(0);
        expect(gain).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it("keeps sounds at a comparable loudness to one another", () => {
    /**
     * Not the per-note cap above: notes struck **together** sum, and the sum is
     * what decides how loud a sound is. "Thunk" was two low sines at 0.3 apiece
     * and rendered at 0.52 against 0.15–0.26 for everything else — switching to
     * it was a jump in volume rather than a change of sound.
     *
     * Notes that merely *overlap* are not the same thing, and modelling it that
     * way was wrong: "Rise" has three notes overlapping during their decay and
     * sums to 0.6 on paper, but renders at 0.20 because each has fallen away
     * before the next peaks. Shared attack time is what adds up.
     */
    for (const sound of SOUNDS) {
      const byAttack = new Map<number, number>();
      for (const note of sound.notes) {
        byAttack.set(note.at, (byAttack.get(note.at) ?? 0) + (note.gain ?? 0.2));
      }
      for (const [, together] of byAttack) expect(together).toBeLessThanOrEqual(0.45);
    }
  });

  it("keeps every note inside what a small speaker can render", () => {
    // Below ~40Hz a phone speaker moves air and makes no pitch; above ~14kHz it
    // is a whistle most ears skip. Both ends read as "the sound is broken".
    for (const sound of SOUNDS) {
      for (const n of sound.notes) {
        for (const hz of [n.hz, n.toHz ?? n.hz]) {
          expect(hz).toBeGreaterThan(40);
          expect(hz).toBeLessThan(14000);
        }
      }
    }
  });

  it("offers a tune as well as a tone", () => {
    // "Twinkle" is the only entry with a shape you could hum, and the generic
    // guards above would all still pass if it were trimmed back to a four-note
    // flick — at which point it is "Sparkle" under a second name and the list
    // is one choice shorter than it looks.
    const tunes = SOUNDS.filter(
      (s) => s.notes.length >= 6 && Math.max(...s.notes.map((n) => n.at)) >= 0.5,
    );

    expect(tunes.length).toBeGreaterThanOrEqual(1);
  });

  it("offers more than one of each shape, so the list is a choice", () => {
    // A list of seven near-identical chimes is one sound with seven names.
    const shapes = new Set(SOUNDS.flatMap((s) => s.notes.map((n) => n.wave ?? "sine")));
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });

  it("defaults every event to a sound that exists", () => {
    for (const event of SOUND_EVENTS) {
      expect(soundById(DEFAULT_SOUNDS[event.id])).toBeDefined();
    }
  });
});

describe("what the device remembers", () => {
  it("starts on the defaults", () => {
    expect(loadSounds()).toEqual(DEFAULT_SOUNDS);
  });

  it("keeps a choice, and only the one that changed", () => {
    saveSound("piece", "blip");

    expect(loadSounds()).toEqual({ ...DEFAULT_SOUNDS, piece: "blip" });
  });

  it("keeps several", () => {
    saveSound("piece", "blip");
    saveSound("sticker", "none");

    expect(loadSounds()).toEqual({ ...DEFAULT_SOUNDS, piece: "blip", sticker: "none" });
  });

  it("falls back per field on a value it does not know", () => {
    // Hand-edited, or left over from a build that had a sound this one does
    // not. One bad field must not take the whole preference down.
    localStorage.setItem("sc_sounds", JSON.stringify({ piece: "trombone", sticker: "blip" }));

    expect(loadSounds()).toEqual({ ...DEFAULT_SOUNDS, sticker: "blip" });
  });

  it("falls back entirely on something that is not even JSON", () => {
    localStorage.setItem("sc_sounds", "{{{");
    expect(loadSounds()).toEqual(DEFAULT_SOUNDS);
  });

  it("survives storage being blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });

    expect(loadSounds()).toEqual(DEFAULT_SOUNDS);
    expect(() => saveSound("piece", "blip")).not.toThrow();
  });
});

describe("playing one", () => {
  /**
   * A minimal Web Audio double: enough to record what was built.
   *
   * A real constructor, not `vi.fn(() => ctx)` — an arrow cannot be called with
   * `new`. And the module is re-imported per test: it caches one `AudioContext`
   * for the life of the page, which is right in a browser and would otherwise
   * leave every test after the first talking to the first test's fake.
   */
  const withAudio = async (state: "running" | "suspended" = "running") => {
    const started: number[] = [];
    const envelope: string[] = [];
    const ramps: { from: number; to: number }[] = [];
    const anchors: { hz: number; at: number }[] = [];
    const ctx = {
      state,
      currentTime: 0,
      resume: vi.fn(),
      destination: {},
      createOscillator: () => {
        const osc = {
          type: "sine",
          frequency: {
            value: 0,
            setValueAtTime: (hz: number, at: number) => {
              osc.frequency.value = hz;
              anchors.push({ hz, at });
            },
            exponentialRampToValueAtTime: (to: number) =>
              ramps.push({ from: osc.frequency.value, to }),
          },
          connect: () => ({ connect: () => undefined }),
          start: (at: number) => started.push(at),
          stop: () => undefined,
        };
        return osc;
      },
      createGain: () => ({
        gain: {
          setValueAtTime: () => envelope.push("set"),
          linearRampToValueAtTime: () => envelope.push("attack"),
          exponentialRampToValueAtTime: () => envelope.push("release"),
        },
        connect: () => ({ connect: () => undefined }),
      }),
    };
    function FakeAudioContext() {
      return ctx;
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.resetModules();
    return { started, envelope, ramps, anchors, ctx, sounds: await import("./sounds") };
  };

  it("plays a note per note in the sound", async () => {
    const { started, sounds } = await withAudio();

    sounds.playSoundId("rise");

    // Asserted against the definition rather than a literal: the point is that
    // every note reaches the engine, not that "rise" happens to have three.
    const notes = sounds.soundById("rise")?.notes.length ?? 0;
    expect(notes).toBeGreaterThan(1);
    expect(started).toHaveLength(notes);
  });

  it("plays nothing at all for None", async () => {
    const { started, sounds } = await withAudio();

    sounds.playSoundId("none");

    expect(started).toEqual([]);
  });

  it("plays nothing for a sound that does not exist", async () => {
    const { started, sounds } = await withAudio();

    sounds.playSoundId("trombone");

    expect(started).toEqual([]);
  });

  it("plays what the device chose for the event", async () => {
    const { started, sounds } = await withAudio();
    sounds.saveSound("taskDone", "blip");

    sounds.playSound("taskDone");

    expect(started).toHaveLength(1); // blip is one note; the default chime is two
  });

  it("wakes a context the browser suspended", async () => {
    // A context made before the first gesture stays suspended, and one the OS
    // parked in the background never wakes itself.
    const { ctx, sounds } = await withAudio("suspended");

    sounds.playSoundId("chime");

    expect(ctx.resume).toHaveBeenCalled();
  });

  it("shapes every note instead of switching it on", async () => {
    // A gain that jumps to full and back leaves a click at each end. The
    // discontinuity is audible and sounds like a fault rather than a note.
    const { envelope, sounds } = await withAudio();

    sounds.playSoundId("blip");

    expect(envelope).toEqual(["set", "attack", "release"]);
  });

  it("glides a note that is a movement rather than a pitch", async () => {
    // A zap falls and a pop rises; writing those as a run of fixed notes gives
    // a staircase you can hear.
    const { ramps, sounds } = await withAudio();

    sounds.playSoundId("zap");

    expect(ramps).toHaveLength(1);
    expect(ramps[0]).toMatchObject({ from: 1200, to: 180 });
  });

  it("anchors the glide at the note's own start", async () => {
    // A ramp with no preceding event runs from the last scheduled value —
    // context time zero — so a glide on a DELAYED note would already be
    // part-way down by the time it sounded. Every glide starts at 0 today; the
    // note that does not is the one nobody would think to check.
    const { anchors, sounds } = await withAudio();

    sounds.playSoundId("drop");

    expect(anchors).toEqual([{ hz: 900, at: 0 }]);
  });

  it("leaves a fixed-pitch note alone", async () => {
    const { ramps, sounds } = await withAudio();

    sounds.playSoundId("chime");

    expect(ramps).toEqual([]);
  });

  it("stays quiet, and does not throw, where there is no Web Audio at all", async () => {
    // The state jsdom is actually in, and the one that matters: a reward sound
    // must never be able to break the thing it is rewarding.
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    vi.resetModules();
    const sounds = await import("./sounds");

    expect(() => sounds.playSoundId("chime")).not.toThrow();
  });

  it("does not throw when the audio engine itself fails", async () => {
    function Exploding() {
      throw new Error("no device");
    }
    vi.stubGlobal("AudioContext", Exploding);
    vi.resetModules();
    const sounds = await import("./sounds");

    expect(() => sounds.playSoundId("chime")).not.toThrow();
  });
});
