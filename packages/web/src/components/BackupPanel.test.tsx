import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupPanel } from "./BackupPanel";

/**
 * The backup screen.
 *
 * The archive and the orchestration have their own tests; what matters here is
 * the gate — restore is the one action that can replace everything.
 */
const onExport = vi.fn();
const onRestore = vi.fn();

const zipFile = (name = "backup.zip") =>
  new File([new Uint8Array([0x50, 0x4b, 3, 4])], name, { type: "application/zip" });

const confirmBox = () => screen.getByLabelText(/type restore to confirm/i);
const restoreButton = () => screen.getByRole("button", { name: "Restore everything" });

beforeEach(() => {
  localStorage.clear();
  onExport.mockReset().mockResolvedValue("sticker-collector-backup-2026-07-29.zip");
  onRestore.mockReset().mockResolvedValue({ restored: { ledger: 3, albums: 1 } });
});

describe("the last backup date", () => {
  it("says so when there has never been one", () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    expect(screen.getByText("Never backed up.")).toBeInTheDocument();
  });

  it("records the date once an export succeeds", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.click(screen.getByRole("button", { name: "Export backup" }));

    await waitFor(() => expect(screen.getByText(/^Last backed up /)).toBeInTheDocument());
    expect(localStorage.getItem("sc_backup_exported_at")).toBeTruthy();
  });

  it("records nothing when the export fails", async () => {
    // A failed export is not a backup, and saying otherwise is worse than
    // saying nothing.
    onExport.mockRejectedValue(new Error("An image could not be read"));
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);

    await userEvent.click(screen.getByRole("button", { name: "Export backup" }));
    await screen.findByRole("alert");

    expect(localStorage.getItem("sc_backup_exported_at")).toBeNull();
    expect(screen.getByText("Never backed up.")).toBeInTheDocument();
  });
});

describe("exporting", () => {
  it("is always available, whatever state the albums are in", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    expect(screen.getByRole("button", { name: "Export backup" })).toBeEnabled();
  });

  it("writes the file and says where it went", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.click(screen.getByRole("button", { name: "Export backup" }));

    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
    expect(
      await screen.findByText("Saved sticker-collector-backup-2026-07-29.zip"),
    ).toBeInTheDocument();
  });

  it("passes today's date, in the user's own calendar", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.click(screen.getByRole("button", { name: "Export backup" }));

    await waitFor(() => {
      const options = onExport.mock.calls[0]?.[0] as { today: string };
      expect(options.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("says so when it fails, rather than looking like it worked", async () => {
    onExport.mockRejectedValue(new Error("An image could not be read"));
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);

    await userEvent.click(screen.getByRole("button", { name: "Export backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An image could not be read");
  });
});

describe("the restore gate", () => {
  it("offers nothing until a file is chosen", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    expect(screen.queryByRole("button", { name: "Restore everything" })).not.toBeInTheDocument();
  });

  it("still refuses once a file is chosen, until the word is typed", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.upload(screen.getByLabelText(/choose a backup file/i), zipFile());

    expect(restoreButton()).toBeDisabled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("keeps refusing the wrong word", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.upload(screen.getByLabelText(/choose a backup file/i), zipFile());

    await userEvent.type(confirmBox(), "RESTORY");
    expect(restoreButton()).toBeDisabled();
  });

  it("opens once the word is typed", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.upload(screen.getByLabelText(/choose a backup file/i), zipFile());

    await userEvent.type(confirmBox(), "RESTORE");
    expect(restoreButton()).toBeEnabled();
  });

  it("forgives case and spacing, like the album delete does", async () => {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.upload(screen.getByLabelText(/choose a backup file/i), zipFile());

    await userEvent.type(confirmBox(), "  restore  ");
    expect(restoreButton()).toBeEnabled();
  });
});

describe("restoring", () => {
  async function ready() {
    render(<BackupPanel onExport={onExport} onRestore={onRestore} />);
    await userEvent.upload(screen.getByLabelText(/choose a backup file/i), zipFile("mine.zip"));
    await userEvent.type(confirmBox(), "RESTORE");
  }

  it("hands over the bytes of the chosen file", async () => {
    await ready();
    await userEvent.click(restoreButton());

    await waitFor(() => expect(onRestore).toHaveBeenCalledOnce());
    const options = onRestore.mock.calls[0]?.[0] as { archive: Uint8Array };
    expect(options.archive).toBeInstanceOf(Uint8Array);
    expect(options.archive.length).toBeGreaterThan(0);
  });

  it("says how much came back", async () => {
    await ready();
    await userEvent.click(restoreButton());

    expect(await screen.findByText(/Restored 4 rows from mine\.zip/)).toBeInTheDocument();
  });

  it("closes the gate again afterwards", async () => {
    // Otherwise a second tap restores a file that is no longer selected.
    await ready();
    await userEvent.click(restoreButton());

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Restore everything" })).not.toBeInTheDocument(),
    );
  });

  it("explains the refusal the ledger makes unavoidable", async () => {
    onRestore.mockRejectedValue(new Error("This account already holds data."));
    await ready();

    await userEvent.click(restoreButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("already holds data");
  });
});
