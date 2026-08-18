import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Raise the async-query timeout above RTL's 1 s default — but keep it well
 * under vitest's `testTimeout`.
 *
 * Nothing here waits a second on purpose. The 1 s default exists to stop a
 * broken test hanging, but on a loaded machine a `findBy*` that normally
 * resolves in 20 ms can exceed it and fail for no reason at all.
 *
 * The margin matters as much as the number: set this *at* `testTimeout` and a
 * retrying query stops failing fast and blows the test timeout instead, which
 * is a worse failure — it reports "timed out in 5000ms" and names no element.
 * 5 s here against 20 s there leaves room for both to do their job.
 *
 * **5 s, not 3.** It was 3000, which is exactly `UNDO_WINDOW_MS`: a test that
 * waits for a deferred completion to commit was racing the timeout that was
 * supposed to be its safety net, and failed roughly one run in three. A
 * deadline equal to the thing it is waiting for is not a deadline.
 */
configure({ asyncUtilTimeout: 5000 });

// React Testing Library leaves the last render mounted; without this a stray
// query in the next test can match the previous test's DOM and pass for the
// wrong reason.
afterEach(cleanup);

/**
 * jsdom implements <dialog> but not its modal methods.
 *
 * `Sheet` and `Dialog` sit on `showModal()` deliberately — it is what supplies
 * the focus trap, Escape-to-close and top-layer stacking (docs/design-system.md).
 * Without this shim every test that opens one throws before rendering.
 *
 * It emulates `open` and the `close` event, and NOTHING else: no focus trap, no
 * inertness, no top layer. So these tests can assert what a dialog contains and
 * how it closes, but never that focus is actually trapped — that remains a
 * browser behaviour, verified by using the app.
 */
const dialog = HTMLDialogElement.prototype as HTMLDialogElement & { _shimmed?: boolean };
if (typeof dialog.showModal !== "function") {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  dialog.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  dialog.close = function close(this: HTMLDialogElement, returnValue?: string) {
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event("close"));
  };
}
