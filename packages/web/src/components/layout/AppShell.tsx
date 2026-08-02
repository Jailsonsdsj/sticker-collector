import { Outlet, useLocation } from "react-router";
import { ApiErrorToast } from "../ApiErrorToast";
import { ErrorBoundary } from "../ErrorBoundary";
import { InstallPrompt } from "../InstallPrompt";
import { UpdateToast } from "../UpdateToast";
import { cx } from "../ui/cx";
import { APP_WIDTH } from "./appWidth";
import { TabBar } from "./TabBar";

/**
 * The frame every screen is born inside.
 *
 * Content scrolls under the translucent tab bar, so the bar's height plus the
 * home-indicator inset is reserved as bottom padding — otherwise the last row
 * of any list sits permanently under the chrome.
 *
 * On a desktop the whole thing is one centred column (`APP_WIDTH`). It is a
 * phone app wherever it is opened, and a five-tab bar spread across a monitor
 * is not a desktop layout, it is a phone layout that was left unattended. A
 * tablet is not a desktop: an iPad fills its screen in both orientations.
 */
export function AppShell() {
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <main
        className={cx(
          APP_WIDTH,
          // The column is a phone-shaped app on a desktop screen; the rules on
          // either side are what make it read as one, rather than as content
          // that failed to fill the window.
          "app-column-framed min-h-dvh px-4",
          "pt-[calc(env(safe-area-inset-top)+var(--space-4))]",
          "pb-[calc(var(--size-tabbar)+env(safe-area-inset-bottom)+var(--space-4))]",
        )}
      >
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
      {/* Outside the boundary and outside the screen: a request can fail from
          anywhere, including from a screen that has just crashed. */}
      <ApiErrorToast />
      <TabBar />
      {/* Above everything, and never in the way: the running version keeps
          working until the user chooses to reload. */}
      <UpdateToast />
    </div>
  );
}
