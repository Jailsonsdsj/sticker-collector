import { useEffect, useState } from "react";
import {
  type ApiErrorEntry,
  clearErrors,
  ERROR_LOG_LIMIT,
  listErrors,
  onError,
} from "../lib/errorLog";
import { describe } from "./ApiErrorToast";
import { SettingsPanel } from "./SettingsPanel";
import { Button, EmptyState } from "./ui";

/**
 * The error log, in Settings.
 *
 * The toast answers "what just happened"; this answers "what keeps happening".
 * It is the only way to look at a failure that occurred on a phone with no
 * debugger attached — which is where every interesting failure in this app
 * occurs.
 *
 * Raw, on purpose: method, path, status and the server's own message. A
 * friendly paraphrase is what the toast is for; a log that hides the status
 * code cannot be used to report anything.
 */
export function ErrorLogPanel() {
  const [entries, setEntries] = useState<ApiErrorEntry[]>(listErrors);

  // Live, so a failure that happens while this screen is open appears on it.
  useEffect(() => onError(setEntries), []);

  return (
    <SettingsPanel
      label="Error log"
      title="Error log"
      description={`The last ${ERROR_LOG_LIMIT} requests that failed, newest first. Kept on this device only.`}
      action={
        entries.length > 0 && (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            onClick={() => {
              clearErrors();
              setEntries([]);
            }}
          >
            Clear
          </Button>
        )
      }
    >
      {entries.length === 0 ? (
        <EmptyState title="Nothing has failed" description="Requests that fail land here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              // Two failures can share a millisecond; the path tells them apart.
              key={`${entry.at}-${entry.path}-${entry.status}`}
              className="rounded-lg bg-surface-1 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-numeric text-2xs font-bold text-magenta">
                  {entry.status === 0 ? "offline" : entry.status}
                </span>
                <span className="font-numeric text-3xs text-ink-muted">{when(entry.at)}</span>
              </div>
              <p className="mt-1 truncate font-numeric text-2xs text-ink-secondary">
                {entry.method} {entry.path}
              </p>
              <p className="mt-1 font-body text-sm text-ink">{describe(entry)}</p>
              {/* The server's own words, when they differ from the paraphrase
                  above — that is the half worth quoting in a bug report. */}
              {entry.message !== describe(entry) && (
                <p className="mt-1 font-numeric text-3xs text-ink-muted">{entry.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsPanel>
  );
}

/** The user's own clock: a log stamped in UTC is a log nobody can line up with
 *  what they were doing. */
function when(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
