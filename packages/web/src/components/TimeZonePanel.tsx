import type { Me } from "@sticker-collector/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { deviceTimeZone, meKey, setAppTimeZone, useMe } from "../lib/timezone";
import { SettingsPanel } from "./SettingsPanel";
import { Button } from "./ui";

/**
 * The timezone every local day is counted in.
 *
 * It is a setting because it is *stored on the account* — the server resolves
 * "today" from it, and it is set once at provisioning, in whatever zone the
 * provisioning script defaulted to. A profile that says Europe/Lisbon while the
 * phone is in Brazil disagrees with the app for four hours every evening, and
 * an undated one-off may only be completed today: those hours return
 * `400: an undated task can only be completed today` on every tick.
 *
 * So this shows both zones, says plainly when they differ, and offers the one
 * fix — adopt the device's.
 */
export function TimeZonePanel() {
  const me = useMe();
  const client = useQueryClient();
  const device = deviceTimeZone();
  const stored = me.data?.timezone;

  const save = useMutation({
    mutationFn: (timezone: string) => api<Me>("/api/me", { method: "PATCH", body: { timezone } }),
    onSuccess: (updated) => {
      setAppTimeZone(updated.timezone);
      client.setQueryData(meKey, updated);
      // Every list is built from a local day, so they are all stale now.
      void client.invalidateQueries();
    },
  });

  const mismatched = Boolean(stored) && stored !== device;

  return (
    <SettingsPanel
      label="Time zone"
      title="Time zone"
      description="Days start and end in this zone — on the server as well as here. It decides which tasks are due today and when a streak breaks."
    >
      <dl className="flex flex-col gap-2">
        <div className="rounded-lg bg-surface-1 p-3">
          <dt className="font-numeric text-3xs text-ink-muted tracking-mono uppercase">Account</dt>
          <dd className="mt-0.5 font-body text-sm text-ink">{stored ?? "…"}</dd>
        </div>
        <div className="rounded-lg bg-surface-1 p-3">
          <dt className="font-numeric text-3xs text-ink-muted tracking-mono uppercase">
            This device
          </dt>
          <dd className="mt-0.5 font-body text-sm text-ink">{device}</dd>
        </div>
      </dl>

      {mismatched && (
        <div className="mt-4 flex flex-col gap-3">
          <p role="alert" className="font-body text-sm text-magenta">
            These disagree. Around midnight in either zone the app and the server will not agree on
            what day it is, and completing a task can fail.
          </p>
          <Button tone="cyan" loading={save.isPending} onClick={() => save.mutate(device)}>
            Use {device}
          </Button>
        </div>
      )}

      {save.isError && (
        <p role="alert" className="mt-3 font-body text-sm text-magenta">
          That could not be saved.
        </p>
      )}
    </SettingsPanel>
  );
}
