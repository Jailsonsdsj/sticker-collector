import { Outlet } from "react-router";
import { TabBar } from "./TabBar";

/**
 * The frame every screen is born inside.
 *
 * Content scrolls under the translucent tab bar, so the bar's height plus the
 * home-indicator inset is reserved as bottom padding — otherwise the last row
 * of any list sits permanently under the chrome.
 */
export function AppShell() {
  return (
    <div className="min-h-dvh">
      <main className="mx-auto w-full max-w-5xl px-4 pt-[calc(env(safe-area-inset-top)+var(--space-4))] pb-[calc(var(--size-tabbar)+env(safe-area-inset-bottom)+var(--space-4))]">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
