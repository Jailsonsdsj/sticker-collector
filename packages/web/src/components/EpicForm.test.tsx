import type { Epic } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EpicForm } from "./EpicForm";

const existing: Epic = {
  id: "e1",
  title: "Study",
  description: null,
  accent: "epic-1",
  status: "active",
  type: "construction",
  coinGoalAlbumId: null,
  createdAt: "2026-07-01T00:00:00Z",
  oneOffTotal: 0,
  oneOffDone: 0,
};

describe("the epic's type", () => {
  it("is a select, starting at Maintaining for a new epic", () => {
    render(<EpicForm open onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: /type/i })).toHaveValue("maintaining");
  });

  it("is sent with the rest of the epic", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EpicForm open onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/title/i), "Study");
    await user.selectOptions(screen.getByRole("combobox", { name: /type/i }), "construction");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "construction" }));
  });

  it("shows an existing epic's own type when editing", () => {
    render(<EpicForm open onClose={vi.fn()} onSubmit={vi.fn()} epic={existing} />);

    expect(screen.getByRole("combobox", { name: /type/i })).toHaveValue("construction");
  });
});
