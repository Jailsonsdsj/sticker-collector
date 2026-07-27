import { DevUI } from "./dev/DevUI";

/**
 * A path check, not a router. D-04 brings the real routing skeleton and this
 * goes away — until then /dev/ui is the only screen worth rendering.
 */
export function App() {
  if (window.location.pathname === "/dev/ui") return <DevUI />;
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="font-display text-5xl tracking-display uppercase italic">Sticker Collector</h1>
      <p className="mt-4 font-body text-lg text-ink-secondary">
        Nothing here yet. The design system lives at{" "}
        <a className="text-cyan underline" href="/dev/ui">
          /dev/ui
        </a>
        .
      </p>
    </main>
  );
}
