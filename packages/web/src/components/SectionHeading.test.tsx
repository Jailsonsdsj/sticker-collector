import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SectionHeading } from "./SectionHeading";

describe("a collapsible heading", () => {
  it("is a button that reports whether its list is showing", () => {
    // `aria-expanded` is what makes this a disclosure rather than a mystery;
    // the caret alone says it only visually.
    render(
      <SectionHeading tone="today" open onToggle={vi.fn()}>
        Today
      </SectionHeading>,
    );

    expect(screen.getByRole("button", { name: /Today/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("reports collapsed too", () => {
    render(
      <SectionHeading tone="today" open={false} onToggle={vi.fn()}>
        Today
      </SectionHeading>,
    );

    expect(screen.getByRole("button", { name: /Today/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("calls back when pressed", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <SectionHeading tone="today" open onToggle={onToggle}>
        Today
      </SectionHeading>,
    );

    await user.click(screen.getByRole("button", { name: /Today/ }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("still shows the count while collapsed", () => {
    // Folding a section away should not also hide how much is in it.
    render(
      <SectionHeading tone="backlog" count={12} open={false} onToggle={vi.fn()}>
        Backlog
      </SectionHeading>,
    );

    expect(screen.getByText("12")).toBeInTheDocument();
  });
});

describe("a plain heading", () => {
  it("stays non-interactive when no toggle is given", () => {
    // Other screens use this heading purely as a label; it must not become a
    // button that does nothing.
    render(
      <SectionHeading tone="missed" count={3}>
        Missed
      </SectionHeading>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Missed")).toBeInTheDocument();
  });
});
