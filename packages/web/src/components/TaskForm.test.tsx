import type { Epic, Task } from "@sticker-collector/shared";
import { render, screen, within } from "@testing-library/react";
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
    description: null,
    accent: "epic-1",
    status: "active" as const,
    coinGoalAlbumId: null,
    createdAt: "2026-07-01T00:00:00Z",
    oneOffTotal: 0,
    oneOffDone: 0,
  },
  {
    id: "e2",
    title: "Health",
    description: null,
    accent: "epic-2",
    status: "active" as const,
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

/**
 * The minimum a routine needs before Save turns on.
 *
 * The type is chosen explicitly: a blank form now opens as a ONE-OFF, so the
 * weekday picker is not on screen until Routine is picked.
 */
async function fillValidRoutine(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText(/title/i), "Stretch");
  await u.click(screen.getByRole("tab", { name: "↻ Routine" }));
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

  it("arrives blank but for the default effort and its reward, when opened from the main button", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup();

    expect(screen.getByLabelText(/title/i)).toHaveValue("");
    expect(screen.getByLabelText(/description/i)).toHaveValue("");
    expect(screen.getByLabelText(/url/i)).toHaveValue("");
    // Effort and its reward arrive at the default; everything else is blank.
    expect(screen.getByLabelText(/^effort/i)).toHaveValue("30");
    expect(screen.getByLabelText(/reward/i)).toHaveValue("30");
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
    // A blank form is a one-off, so there is no weekday picker to be blank.
    expect(screen.getByRole("tab", { name: "· One-off" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Mon" })).not.toBeInTheDocument();

    await fillValidRoutine(u);
    await u.click(save());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ epicId: null }));
  });
});

describe("effort and reward", () => {
  it("mirrors typed effort into reward", async () => {
    const u = userEvent.setup();
    setup();
    // Cleared first: the field arrives at the default now, and typing appends.
    await u.clear(screen.getByLabelText(/^effort/i));
    await u.type(screen.getByLabelText(/^effort/i), "45");
    expect(screen.getByLabelText(/reward/i)).toHaveValue("45");
  });

  it("stops mirroring once reward is edited", async () => {
    const u = userEvent.setup();
    setup();
    await u.clear(screen.getByLabelText(/^effort/i));
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
  it("shows the due date for a one-off and the weekday picker for a routine", async () => {
    const u = userEvent.setup();
    setup();

    // One-off is where the form starts, so this is the first thing seen.
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mon" })).not.toBeInTheDocument();

    await u.click(screen.getByRole("tab", { name: "↻ Routine" }));

    expect(screen.getByRole("button", { name: "Mon" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  });

  it("opens on One-off, and shows it first", async () => {
    setup();

    // Scoped to the type switch: the section chooser below is a tablist too.
    const types = within(screen.getByRole("tablist", { name: "Task type" }))
      .getAllByRole("tab")
      .map((tab) => tab.textContent);
    expect(types).toEqual(["· One-off", "↻ Routine"]);
    expect(screen.getByRole("tab", { name: "· One-off" })).toHaveAttribute("aria-selected", "true");
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

    // Effort no longer has to be typed: it arrives at the default, so a title
    // is the only thing standing between a blank form and a saved task.
    await u.type(screen.getByLabelText(/title/i), "Stretch");
    expect(save()).toBeEnabled();

    // Emptying it puts the form back in the wrong, and says so.
    await u.clear(screen.getByLabelText(/^effort/i));
    expect(screen.getByRole("alert")).toHaveTextContent(/effort/i);
    expect(save()).toBeDisabled();

    await u.type(screen.getByLabelText(/^effort/i), "15");
    expect(save()).toBeEnabled();

    // A routine asks for one more thing, and says so.
    await u.click(screen.getByRole("tab", { name: "↻ Routine" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/weekday/i);
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

const TASK: Task = {
  id: "t1",
  epicId: "e1",
  title: "Stretch",
  description: "In the morning",
  url: null,
  effortMinutes: 15,
  rewardCoins: 15,
  priority: "medium",
  type: "routine",
  weekdays: 0b0000001, // Monday
  startsOn: null,
  endsOn: null,
  dueAt: null,
  pinnedOn: null,
  startedAt: null,
  slots: [],
  createdAt: "2026-07-01T00:00:00Z",
  deletedAt: null,
  lastCompletedOn: null,
};

function setupEdit(task: Task = TASK, extra: Partial<Parameters<typeof TaskForm>[0]> = {}) {
  const onUpdate = vi.fn().mockResolvedValue({});
  const onDelete = vi.fn().mockResolvedValue({});
  const onClose = vi.fn();
  render(
    <TaskForm
      open
      task={task}
      onClose={onClose}
      onSubmit={vi.fn()}
      onUpdate={onUpdate}
      onDelete={onDelete}
      epics={EPICS}
      {...extra}
    />,
  );
  return { onUpdate, onDelete, onClose, user: userEvent.setup() };
}

describe("editing — the form arrives filled in", () => {
  it("seeds every field from the task", () => {
    setupEdit();
    expect(screen.getByLabelText(/title/i)).toHaveValue("Stretch");
    expect(screen.getByLabelText(/description/i)).toHaveValue("In the morning");
    expect(screen.getByLabelText(/^effort/i)).toHaveValue("15");
    expect(screen.getByLabelText(/reward/i)).toHaveValue("15");
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sticker App" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says so in the header", () => {
    setupEdit();
    expect(screen.getByText("Edit task")).toBeInTheDocument();
  });
});

describe("editing — type is fixed at creation", () => {
  it("locks the switch and says why", () => {
    setupEdit();
    expect(screen.getByRole("tab", { name: /routine/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /one-off/i })).toBeDisabled();
    expect(screen.getByText(/fixed at creation/i)).toBeInTheDocument();
  });

  it("leaves it switchable when creating", () => {
    render(<TaskForm open onClose={vi.fn()} onSubmit={vi.fn()} epics={EPICS} />);
    expect(screen.getByRole("tab", { name: /one-off/i })).toBeEnabled();
  });
});

describe("editing — the patch is a diff", () => {
  it("keeps Save off until something actually changes", async () => {
    const u = userEvent.setup();
    setupEdit();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await u.type(screen.getByLabelText(/title/i), "!");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("sends only the field that changed", async () => {
    const { onUpdate, user } = setupEdit();
    await user.clear(screen.getByLabelText(/title/i));
    await user.type(screen.getByLabelText(/title/i), "Stretch more");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledExactlyOnceWith({ title: "Stretch more" });
  });

  it("never sends type, even after the state has one", async () => {
    const { onUpdate, user } = setupEdit();
    await user.click(screen.getByRole("button", { name: "Tue" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const patch = onUpdate.mock.calls[0]?.[0];
    expect(patch).toEqual({ weekdays: 0b0000011 }); // Mon + Tue
    expect(patch).not.toHaveProperty("type");
    expect(patch).not.toHaveProperty("dueAt");
  });

  it("sends a one-off's due date and never a mask", async () => {
    const { onUpdate, user } = setupEdit({
      ...TASK,
      type: "oneoff",
      weekdays: null,
      dueAt: null,
    });
    await user.type(screen.getByLabelText(/due date/i), "2026-08-05");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const patch = onUpdate.mock.calls[0]?.[0];
    expect(patch?.dueAt).toBeTypeOf("string");
    expect(patch).not.toHaveProperty("weekdays");
  });

  it("stays open and keeps the edit when saving fails", async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error("offline"));
    const { onClose, user } = setupEdit(TASK, { onUpdate });

    await user.type(screen.getByLabelText(/title/i), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not save/i);
    expect(screen.getByLabelText(/title/i)).toHaveValue("Stretch!");
  });
});

describe("editing — delete", () => {
  it("asks before deleting", async () => {
    const { onDelete, user } = setupEdit();
    await user.click(screen.getByRole("button", { name: /delete task/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/delete this task/i)).toBeInTheDocument();
  });

  it("says the coins already earned are kept", async () => {
    const { user } = setupEdit();
    await user.click(screen.getByRole("button", { name: /delete task/i }));
    expect(screen.getByText(/coins it already earned are kept/i)).toBeInTheDocument();
  });

  it("deletes once confirmed, and closes", async () => {
    const { onDelete, onClose, user } = setupEdit();
    await user.click(screen.getByRole("button", { name: /delete task/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it("backs out without deleting", async () => {
    const { onDelete, user } = setupEdit();
    await user.click(screen.getByRole("button", { name: /delete task/i }));
    await user.click(screen.getByRole("button", { name: /keep it/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /delete task/i })).toBeInTheDocument();
  });

  it("offers no delete while creating", () => {
    render(<TaskForm open onClose={vi.fn()} onSubmit={vi.fn()} epics={EPICS} />);
    expect(screen.queryByRole("button", { name: /delete task/i })).not.toBeInTheDocument();
  });
});

describe("the description field", () => {
  it("is three times the primitive's default height", () => {
    // A task's description is where the *how* goes — steps, links, the thing
    // you will have forgotten by the time you come back to it. Two rows made a
    // paragraph feel like the wrong place to put it.
    setup();

    expect(screen.getByLabelText(/description/i)).toHaveAttribute("rows", "6");
  });
});

describe("which section a new one-off lands in", () => {
  const sections = () => screen.getByRole("tablist", { name: "Section" });

  it("offers the two lists by name, General first and selected", async () => {
    // Capture is the common case, and the first tab being the selected one is
    // what makes a two-option switch readable at a glance.
    setup();

    const labels = within(sections())
      .getAllByRole("tab")
      .map((tab) => tab.textContent);
    expect(labels).toEqual(["General", "For today"]);
    expect(within(sections()).getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("pins to today when For today is chosen", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup();

    await u.type(screen.getByLabelText(/title/i), "Water the plants");
    await u.click(within(sections()).getByRole("tab", { name: "For today" }));
    await u.click(save());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedOn: expect.any(String) }),
    );
  });

  it("sends no pin for General", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup();

    await u.type(screen.getByLabelText(/title/i), "Water the plants");
    await u.click(save());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ pinnedOn: null }));
  });

  it("goes away once the one-off has a date", async () => {
    const u = userEvent.setup();
    setup();

    await u.type(screen.getByLabelText(/due date/i), "2026-08-09");

    // Not a UI preference: the API validates a fresh completion against the
    // schedule, and an undated one-off is its single exception. A dated task in
    // today's list is a row the server refuses to tick.
    expect(screen.queryByRole("tablist", { name: "Section" })).not.toBeInTheDocument();
  });

  it("is not offered for a routine, which follows its own days", async () => {
    const u = userEvent.setup();
    setup();

    await u.click(screen.getByRole("tab", { name: "↻ Routine" }));

    expect(screen.queryByRole("tablist", { name: "Section" })).not.toBeInTheDocument();
  });
});

describe("saying when a routine runs", () => {
  const routineWith = (slots: { weekday: number; startMin: number; endMin: number }[] = []) =>
    ({
      ...({} as Task),
      id: "other",
      title: "Gym",
      type: "routine" as const,
      weekdays: 0b0000001,
      effortMinutes: 60,
      rewardCoins: 60,
      priority: "medium" as const,
      epicId: null,
      description: null,
      url: null,
      startsOn: null,
      endsOn: null,
      dueAt: null,
      pinnedOn: null,
      startedAt: null,
      slots,
      createdAt: "2026-07-01T00:00:00Z",
      deletedAt: null,
      lastCompletedOn: null,
    }) as Task;

  const asRoutine = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(screen.getByRole("tab", { name: "↻ Routine" }));
    await u.click(screen.getByRole("button", { name: "Mon" }));
  };

  it("asks for a time only for the days that are checked", async () => {
    const u = userEvent.setup();
    setup();
    await asRoutine(u);

    // A grid of seven disabled pairs is a wall of fields that says nothing.
    expect(screen.getByLabelText("Mon start")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tue start")).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Tue" }));
    expect(screen.getByLabelText("Tue start")).toBeInTheDocument();
  });

  it("asks for nothing at all on a one-off", async () => {
    setup();
    expect(screen.queryByLabelText(/start$/)).not.toBeInTheDocument();
  });

  it("keeps Save off until a checked day has both ends of its time", async () => {
    const u = userEvent.setup();
    const { save } = setup();
    await u.type(screen.getByLabelText(/title/i), "Gym");
    await asRoutine(u);

    await u.type(screen.getByLabelText("Mon start"), "12:00");
    expect(save()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/start and an end/);

    await u.type(screen.getByLabelText("Mon end"), "14:00");
    expect(save()).toBeEnabled();
  });

  it("sends the times as minutes from midnight", async () => {
    const u = userEvent.setup();
    const { onSubmit, save } = setup();
    await u.type(screen.getByLabelText(/title/i), "Gym");
    await asRoutine(u);
    await u.type(screen.getByLabelText("Mon start"), "12:00");
    await u.type(screen.getByLabelText("Mon end"), "14:00");

    await u.click(save());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ slots: [{ weekday: 0, startMin: 720, endMin: 840 }] }),
    );
  });

  it("refuses an overlap instead of saving a task that would be invisible", async () => {
    // This was a warning once. The agenda draws two slots in one cell on top of
    // each other, so allowing the save meant allowing a task that vanishes from
    // the day it is scheduled on.
    const u = userEvent.setup();
    const { save } = setup({
      routines: [routineWith([{ weekday: 0, startMin: 720, endMin: 840 }])],
    });
    await u.type(screen.getByLabelText(/title/i), "Lunch run");
    await asRoutine(u);
    await u.type(screen.getByLabelText("Mon start"), "13:00");
    await u.type(screen.getByLabelText("Mon end"), "13:30");

    expect(screen.getByRole("alert")).toHaveTextContent(/already taken by Gym/);
    expect(save()).toBeDisabled();
  });

  it("names the day and hour that is taken, not just the task", async () => {
    // "Overlaps Gym" on a Mon–Fri routine leaves you hunting for which day.
    const u = userEvent.setup();
    setup({ routines: [routineWith([{ weekday: 0, startMin: 720, endMin: 840 }])] });
    await u.type(screen.getByLabelText(/title/i), "Lunch run");
    await asRoutine(u);
    await u.type(screen.getByLabelText("Mon start"), "13:00");
    await u.type(screen.getByLabelText("Mon end"), "13:30");

    expect(screen.getByRole("alert")).toHaveTextContent(/Mon 12:00–14:00/);
  });

  it("lets the save through again once the clash is cleared", async () => {
    // The refusal has to be a state, not a latch.
    const u = userEvent.setup();
    const { save } = setup({
      routines: [routineWith([{ weekday: 0, startMin: 720, endMin: 840 }])],
    });
    await u.type(screen.getByLabelText(/title/i), "Lunch run");
    await asRoutine(u);
    await u.type(screen.getByLabelText("Mon start"), "13:00");
    await u.type(screen.getByLabelText("Mon end"), "13:30");
    expect(save()).toBeDisabled();

    await u.clear(screen.getByLabelText("Mon start"));
    await u.type(screen.getByLabelText("Mon start"), "14:00");
    await u.clear(screen.getByLabelText("Mon end"));
    await u.type(screen.getByLabelText("Mon end"), "15:00");

    expect(save()).toBeEnabled();
  });

  it("refuses an EDIT that moves a routine onto another one", async () => {
    // The commonest way to make a clash: not creating a task, but dragging an
    // existing one onto an hour that is taken. The create path blocks through
    // `validate`; this path only blocks if the clash is checked separately.
    const u = userEvent.setup();
    const gym = routineWith([{ weekday: 0, startMin: 720, endMin: 840 }]);
    const piano = {
      ...routineWith([{ weekday: 0, startMin: 1080, endMin: 1140 }]),
      id: "piano",
      title: "Piano",
    };
    render(
      <TaskForm
        open
        task={piano}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onUpdate={vi.fn()}
        epics={EPICS}
        routines={[gym, piano]}
      />,
    );

    await u.clear(screen.getByLabelText("Mon start"));
    await u.type(screen.getByLabelText("Mon start"), "13:00");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("marks the row that clashes, not just the form", async () => {
    // A Mon–Fri routine that only collides on Wednesday needs to say Wednesday;
    // the sentence at the bottom names the task, the row marker names the day.
    const u = userEvent.setup();
    setup({ routines: [routineWith([{ weekday: 0, startMin: 720, endMin: 840 }])] });
    await u.type(screen.getByLabelText(/title/i), "Lunch run");
    await u.click(screen.getByRole("tab", { name: "↻ Routine" }));
    await u.click(screen.getByRole("button", { name: "Mon" }));
    await u.click(screen.getByRole("button", { name: "Tue" }));
    await u.type(screen.getByLabelText("Mon start"), "13:00");
    await u.type(screen.getByLabelText("Mon end"), "13:30");
    await u.type(screen.getByLabelText("Tue start"), "13:00");
    await u.type(screen.getByLabelText("Tue end"), "13:30");

    // Gym runs on Mondays only, so only the Monday row is marked.
    expect(screen.getAllByTitle("Clashes with Gym")).toHaveLength(1);
  });

  it("says nothing when the times sit back to back", async () => {
    const u = userEvent.setup();
    setup({ routines: [routineWith([{ weekday: 0, startMin: 720, endMin: 840 }])] });
    await u.type(screen.getByLabelText(/title/i), "Lunch run");
    await asRoutine(u);
    await u.type(screen.getByLabelText("Mon start"), "14:00");
    await u.type(screen.getByLabelText("Mon end"), "15:00");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not refuse a routine because of itself while it is being edited", async () => {
    // Re-saving a routine without moving it is the commonest edit there is.
    const existing = { ...routineWith([{ weekday: 0, startMin: 720, endMin: 840 }]), id: "self" };
    const { save } = setup({ task: existing, routines: [existing] });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mon start")).toHaveValue("12:00");
    expect(save()).toBeDisabled(); // nothing changed, which is a different reason
  });
});
