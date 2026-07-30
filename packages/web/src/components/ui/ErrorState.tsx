import type { ReactNode } from "react";
import { ApiError } from "../../lib/api";
import { Button } from "./Button";
import { cx } from "./cx";

/**
 * DERIVED — the bundle has no error state, like `EmptyState` before it.
 *
 * It exists because the alternative is worse than a blank screen. Every screen
 * reads its list as `data ?? []`, so a failed fetch used to fall straight
 * through to the empty state: a dead network told the user *"No albums yet"*.
 * A blank screen reads as broken; a confident empty state reads as **your
 * collection is gone**. This component is the difference between the two.
 *
 * It deliberately looks unlike `EmptyState` — a solid danger border rather than
 * a dashed one — because the two mean opposite things and appear in the same
 * slot.
 */
export interface ErrorStateProps {
  /** Whatever the query threw. Shapes the copy; never rendered raw. */
  error?: unknown;
  onRetry?: () => void;
  /** Overrides the headline when a screen can name what failed. */
  title?: ReactNode;
  /**
   * Overrides the advice. Needed for failures that are not requests at all —
   * a render crash is neither offline nor a bad response, and inferring its
   * copy from an `Error` object would tell a crashed screen it has no
   * connection.
   */
  description?: ReactNode;
  className?: string;
}

/**
 * Offline and broken are different problems with different advice, and the
 * distinction is free: `api()` throws `ApiError` only once a response came
 * back, so anything else — a `TypeError` from `fetch` — means the request never
 * left the device. Telling someone to try again when they are on a train is
 * useless; telling them they are offline is actionable.
 */
export function isOffline(error: unknown): boolean {
  return !(error instanceof ApiError);
}

function describe(error: unknown): string {
  if (isOffline(error)) {
    return "You look offline. Anything already loaded is still readable — this needs a connection.";
  }
  // A 5xx is the server's fault and worth retrying; a 4xx that reached a screen
  // is a bug, and "try again" will not fix it. Neither is worth a status code
  // on screen.
  const status = (error as ApiError).status;
  return status >= 500
    ? "The server had a problem. Nothing was lost — this is only a failed read."
    : "That request was refused. Reloading the app usually clears it.";
}

export function ErrorState({ error, onRetry, title, description, className }: ErrorStateProps) {
  return (
    <div
      // `alert` announces it without moving focus, which would fight a user
      // mid-tap on the tab bar.
      role="alert"
      className={cx(
        "flex flex-col items-center gap-3 rounded-3xl border border-danger",
        "bg-surface-1 px-6 py-10 text-center",
        className,
      )}
    >
      <span aria-hidden className="font-body text-4xl text-danger leading-none">
        ✕
      </span>
      <h3 className="font-display text-2xl tracking-display text-ink-muted uppercase italic">
        {title ?? (isOffline(error) ? "No connection" : "That didn't load")}
      </h3>
      <p className="max-w-xs font-body text-md text-ink-dim leading-relaxed">
        {description ?? describe(error)}
      </p>
      {onRetry && (
        <div className="mt-2">
          <Button variant="outline" tone="neutral" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
