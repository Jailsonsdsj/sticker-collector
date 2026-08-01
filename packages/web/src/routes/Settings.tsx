import { AppIconPicker } from "../components/AppIconPicker";
import { BackupPanel } from "../components/BackupPanel";
import { AppHeader } from "../components/layout";

/**
 * Settings.
 *
 * It exists because the backup has to live somewhere — no screen owned it, and
 * H-04 (the backup nudge and the last-export date) assumes this page is here.
 * The app-icon picker joined it for the same reason: it is a preference, and
 * this is the only screen preferences live on.
 */
export function Settings() {
  return (
    <>
      <AppHeader title="Settings" />
      <AppIconPicker />
      <BackupPanel />
    </>
  );
}
