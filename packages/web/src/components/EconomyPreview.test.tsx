import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type AlbumDraft, initialDraft } from "../lib/albumDraft";
import { EconomyPreview } from "./EconomyPreview";

const key = (n: number) => `img/${n.toString(16).padStart(64, "0")}.jpg`;

function draft(over: Partial<AlbumDraft> = {}): AlbumDraft {
  return { ...initialDraft, title: "Kitchen heroes", coverKey: key(999), ...over };
}

const stickers = (spec: Partial<Record<AlbumDraft["stickers"][number]["tier"], number>>) => {
  let n = 0;
  return Object.entries(spec).flatMap(([tier, count]) =>
    Array.from({ length: count as number }, () => ({
      imageKey: key(++n),
      tier: tier as AlbumDraft["stickers"][number]["tier"],
      title: "",
      description: "",
    })),
  );
};

const panel = () => screen.getByRole("region", { name: "Economy preview" });

describe("total album cost", () => {
  it("is the unlock price plus every sticker at its tier's price", () => {
    render(
      <EconomyPreview
        draft={draft({
          unlockPrice: 500,
          prices: { common: 20, rare: 50, epic: 120, legendary: 400 },
          stickers: stickers({ common: 2, legendary: 1 }),
        })}
      />,
    );
    // 500 + 2x20 + 400
    expect(panel()).toHaveTextContent("940");
  });

  it("says the same number in hours, because one coin is one minute", () => {
    render(
      <EconomyPreview
        draft={draft({ unlockPrice: 4200, prices: { common: 0, rare: 0, epic: 0, legendary: 0 } })}
      />,
    );
    expect(panel()).toHaveTextContent("4,200");
    expect(panel()).toHaveTextContent("70 hours");
  });

  it("reads sensibly for a small album", () => {
    render(
      <EconomyPreview
        draft={draft({ unlockPrice: 45, prices: { common: 0, rare: 0, epic: 0, legendary: 0 } })}
      />,
    );
    expect(panel()).toHaveTextContent("45 min");
  });

  it("shows hours and minutes when it is not a round number", () => {
    render(
      <EconomyPreview
        draft={draft({ unlockPrice: 130, prices: { common: 0, rare: 0, epic: 0, legendary: 0 } })}
      />,
    );
    expect(panel()).toHaveTextContent("2 h 10 min");
  });
});

describe("the expected value of a pull", () => {
  it("sits beside the random price", () => {
    render(
      <EconomyPreview
        draft={draft({
          randomPrice: 40,
          prices: { common: 100, rare: 200, epic: 300, legendary: 400 },
          odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
          stickers: stickers({ common: 1, rare: 1, epic: 1, legendary: 1 }),
        })}
      />,
    );
    expect(panel()).toHaveTextContent(/costs 40,/);
    expect(panel()).toHaveTextContent(/is worth 158(?!\d)/); // 100x60 + 200x25 + 300x12 + 400x3
  });

  it("ignores a tier that holds no stickers", () => {
    // Legendary is priced at 10,000 but empty: it can never be pulled, so
    // advertising it would promise a payout that cannot happen.
    render(
      <EconomyPreview
        draft={draft({
          prices: { common: 10, rare: 20, epic: 30, legendary: 10_000 },
          odds: { common: 60, rare: 25, epic: 12, legendary: 3 },
          stickers: stickers({ common: 1, rare: 1, epic: 1 }),
        })}
      />,
    );
    // Anchored to the phrase, not the digits: a bare "15" also matches "315",
    // which is exactly what weighting by the *declared* odds would produce.
    expect(panel()).toHaveTextContent(/is worth 15(?!\d)/);
    expect(panel()).not.toHaveTextContent(/is worth 315/);
  });

  it("points out a pull that returns less than it costs", () => {
    render(
      <EconomyPreview
        draft={draft({
          randomPrice: 500,
          prices: { common: 10, rare: 10, epic: 10, legendary: 10 },
          stickers: stickers({ common: 2 }),
        })}
      />,
    );
    expect(panel()).toHaveTextContent(/returns less than it costs/);
  });

  it("stays quiet when the pull is generous", () => {
    render(
      <EconomyPreview
        draft={draft({
          randomPrice: 5,
          prices: { common: 100, rare: 100, epic: 100, legendary: 100 },
          stickers: stickers({ common: 2 }),
        })}
      />,
    );
    expect(panel()).not.toHaveTextContent(/returns less than it costs/);
  });
});

describe("tiers that can never be pulled", () => {
  it("names a tier that holds stickers at zero odds", () => {
    render(
      <EconomyPreview
        draft={draft({
          odds: { common: 70, rare: 30, epic: 0, legendary: 0 },
          stickers: stickers({ common: 1, epic: 2 }),
        })}
      />,
    );
    expect(panel()).toHaveTextContent(/can never be pulled/);
    expect(panel()).toHaveTextContent("epic");
  });

  it("says nothing about an empty tier at zero odds", () => {
    render(
      <EconomyPreview
        draft={draft({
          odds: { common: 70, rare: 30, epic: 0, legendary: 0 },
          stickers: stickers({ common: 1, rare: 1 }),
        })}
      />,
    );
    expect(panel()).not.toHaveTextContent(/can never be pulled/);
  });
});

describe("what the preview does not do", () => {
  it("renders no control at all — it cannot block a seal", () => {
    // "Neither figure blocks sealing": the panel is information, and it has no
    // button, no input and no disabled state to get in the way.
    render(
      <EconomyPreview
        draft={draft({
          randomPrice: 5000,
          prices: { common: 1, rare: 1, epic: 1, legendary: 1 },
          stickers: stickers({ common: 1 }),
        })}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders an empty draft without inventing numbers", () => {
    render(<EconomyPreview draft={initialDraft} />);
    expect(panel()).toHaveTextContent("500"); // just the unlock price
  });
});
