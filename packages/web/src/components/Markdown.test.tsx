import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

const md = (source: string) => render(<Markdown>{source}</Markdown>).container;

describe("what survives from the author's typing", () => {
  it("turns the marks into the formatting they stand for", () => {
    md("Water the **big** one, then the *herbs*.");

    expect(screen.getByText("big").tagName).toBe("STRONG");
    expect(screen.getByText("herbs").tagName).toBe("EM");
  });

  it("keeps a single newline as a line break", () => {
    // Markdown's own rule is that one newline is a space. Left alone, every
    // description already written as a list of steps would silently reflow into
    // one run-on paragraph — on data the author cannot see being reinterpreted.
    const container = md("One.\nTwo.\nThree.");

    expect(container.querySelectorAll("br")).toHaveLength(2);
    expect(container.textContent).toBe("One.\nTwo.\nThree.");
  });

  it("leaves plain prose exactly as it was", () => {
    // Everything written before markdown existed here has to render unchanged.
    const container = md("The big one by the window first.");

    expect(container.textContent).toBe("The big one by the window first.");
    expect(container.querySelectorAll("strong, em, code, ul")).toHaveLength(0);
  });

  it("makes a list a list", () => {
    md("- Water\n- Feed\n- Prune");

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("numbers an ordered list", () => {
    const container = md("1. First\n2. Second");

    expect(container.querySelector("ol")).not.toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders a task list, read-only", () => {
    // Ticking one here would have to write back into the description, and the
    // box that completes a task is the one on the task, not one in its notes.
    md("- [x] Done\n- [ ] Not yet");

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[0]).toHaveAttribute("readonly");
  });

  it("keeps code as code rather than as its backticks", () => {
    const container = md("Run `pnpm seed` first.");

    expect(container.querySelector("code")?.textContent).toBe("pnpm seed");
    expect(container.textContent).not.toContain("`");
  });

  it("strikes through, which is GFM rather than plain markdown", () => {
    const container = md("~~cancelled~~");
    expect(container.querySelector("del")?.textContent).toBe("cancelled");
  });

  it("renders a table without letting it widen the sheet", () => {
    // A wide table has to scroll inside its own box; the page must never
    // scroll sideways.
    const container = md("| a | b |\n| - | - |\n| 1 | 2 |");

    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("table")?.parentElement?.className).toContain("overflow-x-auto");
  });

  it("scrolls a long code block inside itself for the same reason", () => {
    const container = md("```\na very long line\n```");
    expect(container.querySelector("pre")?.className).toContain("overflow-x-auto");
  });
});

describe("links", () => {
  it("makes one from the markdown syntax", () => {
    md("See [the docs](https://example.com/x).");

    expect(screen.getByRole("link", { name: "the docs" })).toHaveAttribute(
      "href",
      "https://example.com/x",
    );
  });

  it("makes one from a bare URL, which is what people actually paste", () => {
    md("See https://example.com/x for the rest.");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.com/x");
  });

  it("opens in a new tab without handing it control of this one", () => {
    // `noopener` is the one that matters: a new tab keeping a handle on its
    // opener can navigate this one away.
    md("[x](https://example.com)");

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("what a description cannot do", () => {
  it("shows raw HTML as text rather than running it", () => {
    // The security property, and the reason the renderer builds React elements
    // instead of feeding a string to `dangerouslySetInnerHTML`. If anyone ever
    // adds `rehype-raw`, this is the test that should stop them.
    const container = md("<script>alert(1)</script>");

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("does not smuggle an element in through a tag that looks harmless", () => {
    const container = md("<img src=x onerror=alert(1)>");

    expect(container.querySelector("img")).toBeNull();
  });

  it("has no element with an inline event handler", () => {
    const container = md('<div onclick="alert(1)">hi</div>');

    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.querySelector("div[onclick]")).toBeNull();
  });
});

describe("what it does with nothing", () => {
  it("renders an empty string without falling over", () => {
    expect(md("").textContent).toBe("");
  });

  it("renders whitespace as nothing much", () => {
    expect(md("   \n  ").textContent?.trim()).toBe("");
  });
});
