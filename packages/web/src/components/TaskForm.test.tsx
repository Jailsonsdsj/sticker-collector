import type { Epic } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskForm } from "./TaskForm";

/**
 * The wiring, not the reducer — `lib/taskForm.test.ts` covers the rules. What
 * this file asserts is that the controls are connected to them, and that the
 * done-when holds: from an epic the epic arrives filled in, from the main
 * button nothing does.
 */

const EPICS: Epic[] = [
  {
    id: "e1",
    title: "Sticker App",
    accent: "epic-1",
    coinGoalAlbumId: null,
    createdAt: "2026-07-01T00:00:00Z",
    oneOffTotal: 0,
    oneOffDone: 0,
  },
  {
    id: "e2",
    title: "Health",
    accent: "epic-2",
    coinGoalAlbumId: null,
    createdAt: "2026-07-01T00:00:00Z",
    oneOffTotal: 0,
    oneOffDone: 0,
  },
];

function setup(props: Partial<Parameters<typeof TaskForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({ id: "t1" });
  const onClose = vi.fn();
  render(<TaskForm open onClose={onClose} onSubmit={onSubmit} epics={EPICS} {...props} />);
  return {
    onSubmit,
    onClose,
    save: () => screen.getByRole("button", { name: "Save" }),
    field: (name: string | RegExp) => screen.getByLabelText(name),
    chip: (name: string | RegExp) => screen.getByRole("button", { name }),
  };
}

/** The minimum a routine needs before Save turns on. */
async function fillValidRoutine(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText(/title/i), "Stretch");
  await u.type(screen.getByLabelText(/^effort/i), "15");
  await u.click(screen.getByRole("button", { name: "Mon" }));
}

describe("the done-when — epic pre-fill", () => {
  it("arrives with the epic selected when opened from one", () => {
    setup({ defaultEpicId: "e2" });
    expect(screen.getByRole("button", { name: "Health" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "false");
  });

  it("submits that epic without the user touching it", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup({ defaultEpicId: "e2" });
    await fillValidRoutine(u);
    await u.click(save());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ epicId: "e2" }));
  });

  it("arrives entirely blank when opened from the main button", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup();

    expect(screen.getByLabelText(/title/i)).toHaveValue("");
    expect(screen.getByLabelText(/description/i)).toHaveValue("");
    expect(screen.getByLabelText(/url/i)).toHaveValue("");
    expect(screen.getByLabelText(/^effort/i)).toHaveValue("");
    expect(screen.getByLabelText(/reward/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
    for (const day of ["Mon", "Sat", "Sun"]) {
      expect(screen.getByRole("button", { name: day })).toHaveAttribute("aria-pressed", "false");
    }

    await fillValidRoutine(u);
    await u.click(save());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ epicId: null }));
  });
});

describe("effort and reward", () => {
  it("mirrors typed effort into reward", async () => {
    const u = userEvent.setup();
    setup();
    await u.type(screen.getByLabelText(/^effort/i), "45");
    expect(screen.getByLabelText(/reward/i)).toHaveValue("45");
  });

  it("stops mirroring once reward is edited", async () => {
    const u = userEvent.setup();
    setup();
    await u.type(screen.getByLabelText(/^effort/i), "45");
    await u.clear(screen.getByLabelText(/reward/i));
    await u.type(screen.getByLabelText(/reward/i), "100");
    await u.type(screen.getByLabelText(/^effort/i), "0"); // now 450

    expect(screen.getByLabelText(/reward/i)).toHaveValue("100");
    expect(screen.getByText(/overridden/i)).toBeInTheDocument();
  });

  it("sets effort from a preset chip", async () => {
    const u = userEvent.setup();
    setup();
    await u.click(screen.getByRole("button", { name: "60m" }));
    expect(screen.getByLabelText(/^effort/i)).toHaveValue("60");
    expect(screen.getByLabelText(/reward/i)).toHaveValue("60");
  });
});

describe("the type switch changes which schedule is asked for", () => {
  it("shows the weekday picker for a routine and the due date for a one-off", async () => {
    const u = userEvent.setup();
    setup();

    expect(screen.getByRole("button", { name: "Mon" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();

    await u.click(screen.getByRole("tab", { name: "· One-off" }));

    expect(screen.queryByRole("button", { name: "Mon" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
  });

  it("sends a mask for a routine and no due date", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup();
    await fillValidRoutine(u);
    await u.click(screen.getByRole("button", { name: "Tue" }));
    await u.click(save());

    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ type: "routine", weekdays: 0b0000011 }); // Mon + Tue
    expect(payload).not.toHaveProperty("dueAt");
  });

  it("sends a due date for a one-off and no mask", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup();
    await u.type(screen.getByLabelText(/title/i), "Passport");
    await u.type(screen.getByLabelText(/^effort/i), "60");
    await u.click(screen.getByRole("tab", { name: "· One-off" }));
    await u.click(save());

    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ type: "oneoff" });
    expect(payload).not.toHaveProperty("weekdays");
  });
});

describe("saving", () => {
  it("keeps Save off until the form is valid, and says why", async () => {
    const u = userEvent.setup();
    const { save } = setup();
    expect(save()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/title/i);

    await u.type(screen.getByLabelText(/title/i), "Stretch");
    expect(screen.getByRole("alert")).toHaveTextContent(/effort/i);

    await u.type(screen.getByLabelText(/^effort/i), "15");
    expect(screen.getByRole("alert")).toHaveTextContent(/weekday/i); // routine needs a day
    expect(save()).toBeDisabled();

    await u.click(screen.getByRole("button", { name: "Mon" }));
    expect(save()).toBeEnabled();
  });

  it("closes on success", async () => {
    const u = userEvent.setup();
    const { onClose, save } = setup();
    await fillValidRoutine(u);
    await u.click(save());
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open and reports the failure, so nothing typed is lost", async () => {
    const u = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("offline"));
    const { onClose, save } = setup({ onSubmit });

    await fillValidRoutine(u);
    await u.click(save());

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not save/i);
    expect(screen.getByLabelText(/title/i)).toHaveValue("Stretch");
  });

  it("cancels without submitting", async () => {
    const u = userEvent.setup();
    const { onSubmit, onClose } = setup();
    await fillValidRoutine(u);
    await u.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
