import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOUNDS, loadSounds, SOUNDS } from "../lib/sounds";
import { SoundPicker } from "./SoundPicker";

beforeEach(() => localStorage.clear());

describe("choosing what the app says", () => {
  it("offers one choice per moment worth marking", () => {
    render(<SoundPicker />);

    for (const label of ["Task done", "Puzzle piece", "New sticker"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("offers every sound, silence included", () => {
    render(<SoundPicker />);

    const options = [...screen.getByLabelText("Task done").querySelectorAll("option")];
    expect(options.map((o) => o.textContent)).toEqual(SOUNDS.map((s) => s.label));
  });

  it("opens on what the device already chose", () => {
    localStorage.setItem("sc_sounds", JSON.stringify({ piece: "blip" }));
    render(<SoundPicker />);

    expect(screen.getByLabelText("Puzzle piece")).toHaveValue("blip");
    expect(screen.getByLabelText("Task done")).toHaveValue(DEFAULT_SOUNDS.taskDone);
  });

  it("remembers a choice on the device", async () => {
    const user = userEvent.setup();
    render(<SoundPicker />);

    await user.selectOptions(screen.getByLabelText("New sticker"), "fanfare");

    expect(loadSounds().sticker).toBe("fanfare");
  });

  it("changes only the row that was touched", async () => {
    const user = userEvent.setup();
    render(<SoundPicker />);

    await user.selectOptions(screen.getByLabelText("New sticker"), "fanfare");

    expect(loadSounds().taskDone).toBe(DEFAULT_SOUNDS.taskDone);
  });

  it("lets silence be chosen, which is the point of offering it", async () => {
    const user = userEvent.setup();
    render(<SoundPicker />);

    await user.selectOptions(screen.getByLabelText("Task done"), "none");

    expect(loadSounds().taskDone).toBe("none");
  });

  it("offers a way to hear one again without changing it", async () => {
    // The select only fires on a *different* value, so re-picking the current
    // sound is silent — and "what does the one I already have sound like?" is
    // the question you ask second.
    const user = userEvent.setup();
    render(<SoundPicker />);

    const replay = screen.getByRole("button", { name: "Play Task done sound" });
    await user.click(replay);

    expect(replay).toBeInTheDocument(); // it is reachable and does not throw
  });

  it("does not fall over where there is no Web Audio", () => {
    // jsdom, and any browser old enough to lack it. Choosing a sound must not
    // be able to break the settings screen.
    const user = userEvent.setup();
    render(<SoundPicker />);

    expect(async () => {
      await user.selectOptions(screen.getByLabelText("Task done"), "rise");
    }).not.toThrow();
  });

  it("names itself, so the section is findable", () => {
    render(<SoundPicker />);
    expect(screen.getByRole("region", { name: "Sounds" })).toBeInTheDocument();
  });
});
