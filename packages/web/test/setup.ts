import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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
