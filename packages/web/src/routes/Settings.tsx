import { AppIconPicker } from "../components/AppIconPicker";
import { BackupPanel } from "../components/BackupPanel";
import { ErrorLogPanel } from "../components/ErrorLogPanel";
import { AppHeader } from "../components/layout";

/**
 * Settings.
 *
 * It exists because the backup has to live somewhere — no screen owned it, and
 * H-04 (the backup nudge and the last-export date) assumes this page is here.
 * The app-icon picker joined it for the same reason: it is a preference, and
 * this is the only screen preferences live on. So did the error log: the toast
 * that announces a failure is gone in six seconds, and "it did that again
 * yesterday" needs somewhere to look.
 */
export function Settings() {
  return (
    <>
      <AppHeader title="Settings" />
      <AppIconPicker />
      <BackupPanel />
      <ErrorLogPanel />
    </>
  );
}
