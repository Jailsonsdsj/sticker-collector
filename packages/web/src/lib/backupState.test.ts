import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissNudge,
  lastAlbumChange,
  lastExportAt,
  recordExport,
  shouldNudge,
} from "./backupState";

const album = (createdAt: string, completedAt: string | null = null) => ({
  createdAt,
  completedAt,
});

const JAN = "2026-01-10T09:00:00.000Z";
const FEB = "2026-02-10T09:00:00.000Z";
const MAR = "2026-03-10T09:00:00.000Z";

beforeEach(() => localStorage.clear());

describe("the last export", () => {
  it("is nothing before the first one", () => {
    expect(lastExportAt()).toBeNull();
  });

  it("is remembered once written", () => {
    recordExport(FEB);
    expect(lastExportAt()).toBe(FEB);
  });

  it("moves forward when a newer one is written", () => {
    recordExport(JAN);
    recordExport(MAR);
    expect(lastExportAt()).toBe(MAR);
  });
});

describe("what counts as a change worth backing up", () => {
  it("is the newest album creation", () => {
    expect(lastAlbumChange([album(JAN), album(MAR), album(FEB)])).toBe(MAR);
  });

  it("counts a completion as well as a creation", () => {
    // The spec names both: created *or* completed.
    expect(lastAlbumChange([album(JAN, MAR)])).toBe(MAR);
  });

  it("is nothing at all when there are no albums", () => {
    expect(lastAlbumChange([])).toBeNull();
  });
});

describe("whether to ask for a backup", () => {
  it("asks after an album is created", () => {
    recordExport(JAN);
    expect(shouldNudge([album(FEB)])).toBe(true);
  });

  it("asks after an album is completed", () => {
    recordExport(FEB);
    expect(shouldNudge([album(JAN, MAR)])).toBe(true);
  });

  it("asks a user who has never exported anything", () => {
    expect(shouldNudge([album(JAN)])).toBe(true);
  });

  it("stays quiet when the export is newer than the change", () => {
    recordExport(MAR);
    expect(shouldNudge([album(JAN, FEB)])).toBe(false);
  });

  it("stays quiet when the export is exactly as new", () => {
    recordExport(FEB);
    expect(shouldNudge([album(FEB)])).toBe(false);
  });

  it("stays quiet when there is nothing to lose yet", () => {
    expect(shouldNudge([])).toBe(false);
  });

  it("stays quiet with no albums even after an earlier dismissal", () => {
    // Delete every album and the shelf is empty again — a nudge there would be
    // asking someone to back up nothing.
    dismissNudge(FEB);
    expect(shouldNudge([])).toBe(false);
  });

  it("stays quiet with no albums even after an export", () => {
    recordExport(JAN);
    expect(shouldNudge([])).toBe(false);
  });
});

describe("dismissing it", () => {
  it("silences that change", () => {
    dismissNudge(FEB);
    expect(shouldNudge([album(FEB)])).toBe(false);
  });

  it("comes back when something new happens", () => {
    // A nudge you can silence forever is not insurance.
    dismissNudge(FEB);
    expect(shouldNudge([album(FEB), album(MAR)])).toBe(true);
  });

  it("is superseded by an export anyway", () => {
    dismissNudge(FEB);
    recordExport(MAR);
    expect(shouldNudge([album(FEB)])).toBe(false);
  });
});
