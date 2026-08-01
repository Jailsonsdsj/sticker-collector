import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WalletCard } from "./WalletCard";

/** A coin is a minute, so the balance doubles as hours invested. */
describe("the wallet", () => {
  it("shows the balance", () => {
    render(<WalletCard balance={1500} />);
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("counts pending coins as already earned", () => {
    // "The reward must be felt, or the loop is just a checkbox" — coins inside
    // the undo window are shown the moment the box is ticked.
    render(<WalletCard balance={1500} pendingCoins={30} />);
    expect(screen.getByText("1,530")).toBeInTheDocument();
  });

  it("states the hours that balance represents", () => {
    render(<WalletCard balance={1500} />);
    expect(screen.getByText("≈ 25h 0m")).toBeInTheDocument();
  });

  it("names itself as a region, so the balance is reachable by role", () => {
    render(<WalletCard balance={0} />);
    expect(screen.getByRole("region", { name: "Wallet" })).toBeInTheDocument();
  });
});

describe("the corner slot", () => {
  it("renders whatever the caller puts there", () => {
    // A slot, not a hard-coded link: the wallet is presentational and has no
    // business importing the router.
    render(<WalletCard balance={0} action={<button type="button">Settings</button>} />);
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("sits above the hours line, not in place of it", () => {
    render(<WalletCard balance={1500} action={<span data-testid="slot">⚙</span>} />);

    const slot = screen.getByTestId("slot");
    const hours = screen.getByText("≈ 25h 0m");

    expect(slot.parentElement).toBe(hours.parentElement);
    // DOCUMENT_POSITION_FOLLOWING: the hours line comes after the slot.
    expect(slot.compareDocumentPosition(hours) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("survives the loading state, when there are no hours to show yet", () => {
    render(<WalletCard loading action={<span data-testid="slot">⚙</span>} />);

    expect(screen.getByTestId("slot")).toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });
});

describe("the coin", () => {
  it("turns on the spot", () => {
    // Spins in place — it does not travel across the card.
    const { container } = render(<WalletCard balance={1500} />);
    expect(container.querySelector(".coin-body")).toHaveClass("animate-coin-spin");
  });

  it("keeps its place in the layout while it turns", () => {
    // A rotateY does not affect layout, which is the point: the balance beside
    // it must not shuffle sideways once a frame.
    const { container } = render(<WalletCard balance={1500} />);
    const coin = container.querySelector(".coin") as HTMLElement;

    expect(coin).toHaveClass("size-7");
    expect(coin.className).not.toMatch(/absolute|translate-x/);
  });
});
