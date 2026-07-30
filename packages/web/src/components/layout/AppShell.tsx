import { Outlet, useLocation } from "react-router";
import { ErrorBoundary } from "../ErrorBoundary";
import { InstallPrompt } from "../InstallPrompt";
import { UpdateToast } from "../UpdateToast";
import { TabBar } from "./TabBar";

/**
 * The frame every screen is born inside.
 *
 * Content scrolls under the translucent tab bar, so the bar's height plus the
 * home-indicator inset is reserved as bottom padding — otherwise the last row
 * of any list sits permanently under the chrome.
 */
export function AppShell() {
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <main className="mx-auto w-full max-w-5xl px-4 pt-[calc(env(safe-area-inset-top)+var(--space-4))] pb-[calc(var(--size-tabbar)+env(safe-area-inset-bottom)+var(--space-4))]">
        {/* Above the screen rather than inside one: installing is about the
            app, not about whichever tab happens to be open. */}
        <InstallPrompt />
        {/* Keyed by path so navigating away clears a crash. Without it the
            boundary stays broken for the rest of the session and the tab bar
            leads nowhere — which is the blank screen again, with a border. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <TabBar />
      {/* Above everything, and never in the way: the running version keeps
          working until the user chooses to reload. */}
      <UpdateToast />
    </div>
  );
}
