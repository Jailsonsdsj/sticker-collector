import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { initialDraft } from "../../lib/albumDraft";
import { StickersStep } from "./StickersStep";

vi.mock("./ImagePicker", () => ({
  ImagePicker: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const renderStep = (draft = initialDraft) =>
  render(<StickersStep draft={draft} problems={{}} dispatch={vi.fn()} />);

describe("the hide-locked control", () => {
  it("sits against the left edge, not in the middle of the form", () => {
    // The checkbox centres its own box inside a 44px tap target, so a stretched
    // flex item parks it in the centre of the column.
    renderStep();

    const label = screen.getByRole("checkbox", { name: "Hide locked images" })
      .parentElement as HTMLElement;
    expect(label.className).toContain("self-start");
  });

  it("keeps the 44px target it was given", () => {
    // Aligning it left must not undo TD-24.
    renderStep();

    const label = screen.getByRole("checkbox", { name: "Hide locked images" })
      .parentElement as HTMLElement;
    expect(label.className).toContain("min-w-11");
    expect(label.className).toContain("min-h-11");
  });

  it("offers the locked cover only once something is hidden", () => {
    renderStep();
    expect(screen.queryByRole("button", { name: /locked cover/i })).not.toBeInTheDocument();

    renderStep({ ...initialDraft, hideLocked: true });
    expect(screen.getByRole("button", { name: /locked cover/i })).toBeInTheDocument();
  });
});
