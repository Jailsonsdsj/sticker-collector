/**
 * Stands in for `virtual:pwa-register`, which only exists inside a Vite build
 * with the PWA plugin loaded.
 *
 * Aliased in `vitest.config.ts`. Without it, every test that transitively
 * imports `lib/serviceWorker.ts` fails to resolve the module — vite analyses the
 * specifier at transform time even though the import is dynamic.
 *
 * It reports no update, which is the ordinary case. A test that wants one
 * injects its own `register` into `UpdateToast`.
 */
export function registerSW(_options?: unknown): (reload?: boolean) => Promise<void> {
  return async () => undefined;
}
