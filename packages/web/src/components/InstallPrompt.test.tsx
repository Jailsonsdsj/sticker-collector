import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

/**
 * Installing, on the two platforms that do it completely differently.
 *
 * Chrome fires `beforeinstallprompt`; iOS Safari never does and has no API at
 * all. Both paths are faked here — what is tested is which one the component
 * chooses and whether it ever nags.
 */
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CHROME =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

function setAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

function setStandalone(standalone: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** The event Chrome fires, with the `prompt()` the browser expects us to defer. */
function fireInstallable() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt") as Event & { prompt: typeof prompt };
  event.prompt = prompt;
  window.dispatchEvent(event);
  return prompt;
}

const banner = () => screen.queryByRole("complementary", { name: "Install this app" });

beforeEach(() => {
  localStorage.clear();
  setAgent(CHROME);
  setStandalone(false);
});

afterEach(() => vi.unstubAllGlobals());

describe("on a browser that can install", () => {
  it("says nothing until the browser offers", async () => {
    render(<InstallPrompt />);
    expect(banner()).not.toBeInTheDocument();
  });

  it("offers to install once the browser does", async () => {
    render(<InstallPrompt />);
    fireInstallable();

    expect(await screen.findByRole("button", { name: "Install" })).toBeInTheDocument();
  });

  it("installs through the event the browser handed over", async () => {
    // The browser only honours `prompt()` from a gesture, which is why the
    // event is held rather than fired on arrival.
    render(<InstallPrompt />);
    const prompt = fireInstallable();

    await userEvent.click(await screen.findByRole("button", { name: "Install" }));
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("does not offer twice — the event is single-use", async () => {
    render(<InstallPrompt />);
    fireInstallable();
    await userEvent.click(await screen.findByRole("button", { name: "Install" }));

    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("shows no iOS instructions where a real button exists", async () => {
    render(<InstallPrompt />);
    fireInstallable();
    await screen.findByRole("button", { name: "Install" });

    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument();
  });
});

describe("on iOS, where no event ever comes", () => {
  it("says where the button is instead", () => {
    setAgent(IPHONE);
    render(<InstallPrompt />);

    expect(banner()).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it("offers no install button, because there is no API to call", () => {
    setAgent(IPHONE);
    render(<InstallPrompt />);
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("keeps quiet inside a Chrome-on-iOS that cannot install either", () => {
    setAgent(`${IPHONE} CriOS/120`);
    render(<InstallPrompt />);
    expect(banner()).not.toBeInTheDocument();
  });
});

describe("once it is installed", () => {
  it("says nothing at all when launched standalone", () => {
    setStandalone(true);
    setAgent(IPHONE);
    render(<InstallPrompt />);

    expect(banner()).not.toBeInTheDocument();
  });

  it("says nothing on iOS standalone, which reports itself differently", () => {
    setAgent(IPHONE);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    render(<InstallPrompt />);

    expect(banner()).not.toBeInTheDocument();
    Object.defineProperty(navigator, "standalone", { value: undefined, configurable: true });
  });
});

describe("dismissing it", () => {
  it("stays gone for good", async () => {
    // A nudge that returns every launch is worse than no nudge.
    setAgent(IPHONE);
    const { unmount } = render(<InstallPrompt />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(banner()).not.toBeInTheDocument();

    unmount();
    render(<InstallPrompt />);
    expect(banner()).not.toBeInTheDocument();
  });

  it("is remembered after an install, too", async () => {
    render(<InstallPrompt />);
    fireInstallable();
    await userEvent.click(await screen.findByRole("button", { name: "Install" }));

    expect(localStorage.getItem("sc_install_dismissed")).toBe("1");
  });
});
