import { BackupPanel } from "../components/BackupPanel";
import { AppHeader } from "../components/layout";

/**
 * Settings.
 *
 * It exists because the backup has to live somewhere — no screen owned it, and
 * H-04 (the backup nudge and the last-export date) assumes this page is here.
 */
export function Settings() {
  return (
    <>
      <AppHeader title="Settings" />
      <BackupPanel />
    </>
  );
}
