import { Link, useRouteError } from "react-router";
import { ErrorState } from "./ui";

/**
 * The router's error element.
 *
 * React Router does **not** let a crash reach a React error boundary mounted
 * above it: every route gets a default boundary of the router's own, which
 * catches the throw first and renders a developer page — "Unexpected
 * Application Error!", the raw message, and a full stack trace, on screen, to
 * the end user. That is not a blank page, but it is worse than one: it leaks
 * internals and offers nothing to do about them.
 *
 * So the fallback has to be installed *as* `errorElement`. `AppShell`'s
 * boundary still handles the tab screens — it is nested closer to the throw, so
 * React reaches it first — and this covers what sits outside the shell:
 * `/login`, `/dev/ui`, and `AppShell` itself.
 */
export function RouteCrash() {
  const error = useRouteError();
  console.error("Route crashed:", error);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <ErrorState
        title="This screen broke"
        description="Something went wrong drawing this screen. Your data is untouched — nothing here was saved or lost."
        // No retry: unlike the in-shell boundary there is no component state to
        // clear, so "try again" would re-render the same crash. Going somewhere
        // that works is the only real move.
      />
      <div className="mt-4 flex justify-center">
        {/* A link, not a Button: at this point the tab bar may not be on
            screen, and the one thing that still works is navigation. */}
        <Link
          to="/"
          className="rounded-lg border border-border-strong px-4 py-2 font-body text-md font-bold text-ink no-underline"
        >
          Back to tasks
        </Link>
      </div>
    </div>
  );
}
