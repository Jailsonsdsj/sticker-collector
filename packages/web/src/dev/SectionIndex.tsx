import { useEffect, useState } from "react";

/**
 * Jump links, read from the DOM after mount rather than from a hand-kept list
 * — a gallery added without touching this file still shows up.
 */
export function SectionIndex() {
  const [items, setItems] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    const found = Array.from(document.querySelectorAll("section[id]")).map((el) => ({
      id: el.id,
      label: el.querySelector("h2 span:last-of-type")?.textContent?.trim() ?? el.id,
    }));
    setItems(found);
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-30 -mx-6 mb-8 flex flex-wrap gap-2 border-b border-border bg-void/95 px-6 py-3"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="rounded-full border border-border px-3 py-1 font-numeric text-2xs text-ink-muted no-underline transition-colors hover:border-cyan hover:text-cyan"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
