import type { Priority } from "@sticker-collector/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskRow } from "./TaskRow";

/**
 * Behaviour, not markup.
 *
 * jsdom loads no stylesheet, so a computed background colour is unassertable —
 * but the custom properties TaskRow writes ARE its output. Tailwind only
 * consumes them. So the contract under test is the mapping: which token a
 * priority resolves to, which token an epic resolves to, and the fact that the
 * two are independent.
 *
 * Asserting className substrings would be markup testing and would break every
 * time a utility is reordered. Asserting the resolved token breaks only when
 * the mapping is actually wrong.
 */

const PRIORITIES: Priority[] = ["high", "medium", "low"];

function renderRow(props: Partial<Parameters<typeof TaskRow>[0]> = {}) {
  const { container } = render(
    <TaskRow title="Stretch" priority="medium" rewardCoins={15} {...props} />,
  );
  const row = container.firstElementChild as HTMLElement;
  return { row, vars: (name: string) => row.style.getPropertyValue(name).trim() };
}

describe("priority tint", () => {
  it("resolves each priority to its own row and border token", () => {
    for (const priority of PRIORITIES) {
      const { vars } = renderRow({ priority });
      expect(vars("--ui-row")).toBe(`var(--color-prio-${short(priority)}-row)`);
      expect(vars("--ui-row-border")).toBe(`var(--color-prio-${short(priority)}-row-border)`);
    }
  });

  it("gives the three levels three different tints", () => {
    const tints = PRIORITIES.map((priority) => renderRow({ priority }).vars("--ui-row"));
    expect(new Set(tints).size).toBe(3);
  });

  it("labels the level in text, so colour is never the only signal", () => {
    renderRow({ priority: "high" });
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });
});

describe("epic accent", () => {
  it("resolves the accent token", () => {
    expect(renderRow({ epicAccent: "epic-3" }).vars("--ui-epic")).toBe("var(--color-epic-3)");
    expect(renderRow({ epicAccent: "epic-5" }).vars("--ui-epic")).toBe("var(--color-epic-5)");
  });

  it("falls back to a neutral edge when the task has no epic", () => {
    expect(renderRow({ epicAccent: null }).vars("--ui-epic")).toBe("var(--color-epic-none)");
    expect(renderRow({}).vars("--ui-epic")).toBe("var(--color-epic-none)");
  });
});

describe("the two signals coexist — the T-08 done-when", () => {
  it("sets the priority tint AND the epic border together, at every level", () => {
    for (const priority of PRIORITIES) {
      const { vars } = renderRow({ priority, epicAccent: "epic-2" });
      expect(vars("--ui-row")).toBe(`var(--color-prio-${short(priority)}-row)`);
      expect(vars("--ui-epic")).toBe("var(--color-epic-2)"); // unchanged by priority
    }
  });

  it("keeps the epic accent independent of priority", () => {
    const a = renderRow({ priority: "high", epicAccent: "epic-1" }).vars("--ui-epic");
    const b = renderRow({ priority: "low", epicAccent: "epic-1" }).vars("--ui-epic");
    expect(a).toBe(b);
  });
});

describe("completion state", () => {
  it("reports the checkbox as checked when done", () => {
    renderRow({ done: true, title: "Stretch" });
    expect(screen.getByRole("checkbox", { name: "Stretch" })).toBeChecked();
  });

  it("is unchecked otherwise", () => {
    renderRow({ title: "Stretch" });
    expect(screen.getByRole("checkbox", { name: "Stretch" })).not.toBeChecked();
  });

  it("calls onToggle with the next state", async () => {
    const onToggle = vi.fn();
    renderRow({ onToggle, title: "Stretch" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Stretch" }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled — the read-only home screen must not mutate", async () => {
    const onToggle = vi.fn();
    renderRow({ onToggle, disabled: true, title: "Stretch" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Stretch" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("content", () => {
  it("shows the reward, the epic and the type when given them", () => {
    renderRow({ rewardCoins: 45, epicTitle: "Health", typeLabel: "↻ routine" });
    expect(screen.getByText("+45")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("↻ routine")).toBeInTheDocument();
  });

  it("omits the epic and type rows when absent, rather than rendering blanks", () => {
    renderRow({});
    expect(screen.queryByText("↻ routine")).not.toBeInTheDocument();
    expect(screen.queryByText("· one-off")).not.toBeInTheDocument();
  });
});

const short = (p: Priority) => (p === "medium" ? "med" : p);
