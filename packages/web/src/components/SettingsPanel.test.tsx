import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppIconPicker } from "./AppIconPicker";
import { BackupPanel } from "./BackupPanel";
import { ErrorLogPanel } from "./ErrorLogPanel";
import { SettingsPanel } from "./SettingsPanel";

/**
 * Settings grew a section at a time, and each one dressed itself: a bare
 * heading over loose content next to two bordered cards, with the headings a
 * size apart. These assert the shape is now one component's job.
 */
describe("a settings panel", () => {
  it("names its region, so the screen is navigable by landmark", () => {
    render(<SettingsPanel label="Backup" title="Backup" description="what it is for" />);

    expect(screen.getByRole("region", { name: "Backup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Backup" })).toBeInTheDocument();
  });

  it("puts its action on the heading's line", () => {
    render(
      <SettingsPanel
        label="Error log"
        title="Error log"
        description="what it is for"
        action={<button type="button">Clear</button>}
      />,
    );

    // Where a "Clear" belongs — beside the thing it clears, not below it.
    const heading = screen.getByRole("heading", { name: "Error log" });
    expect(heading.parentElement).toContainElement(screen.getByRole("button", { name: "Clear" }));
  });

  it("leaves out the content block when there is none", () => {
    const { container } = render(
      <SettingsPanel label="Backup" title="Backup" description="what it is for" />,
    );

    // An empty div with a top margin is a gap nobody asked for.
    expect(container.querySelector("section")?.children).toHaveLength(2);
  });
});

describe("every section on the Settings screen", () => {
  const panels = [
    ["Backup", <BackupPanel key="b" />],
    ["App icon", <AppIconPicker key="i" />],
    ["Error log", <ErrorLogPanel key="e" />],
  ] as const;

  it.each(panels.map(([name]) => name))("wears the same card: %s", (name) => {
    const [, element] = panels.find(([label]) => label === name) as (typeof panels)[number];
    render(element);

    const section = screen.getByRole("region", { name });
    // The pattern, spelled out once: the three that drifted were a missing
    // border, a missing ground, and a heading one step too large.
    expect(section.className).toContain("rounded-3xl");
    expect(section.className).toContain("border-border");
    expect(section.className).toContain("bg-panel");
    expect(screen.getByRole("heading", { name }).className).toContain("text-xl");
  });
});
