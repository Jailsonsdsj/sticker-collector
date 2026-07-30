import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * The offline contract, as data.
 *
 * It lives in its own module rather than inline in `vite.config.ts` so the rules
 * can be asserted directly. A caching strategy is exactly the kind of thing that
 * looks right, ships, and is discovered to be wrong on a train.
 *
 * Scope is `architecture.md` §6 — **read anywhere, write online**. Queuing
 * mutations for replay is the offline outbox, and that is deliberately v1.1:
 * every mutation already carries an idempotency key, so adding it later is a
 * queue and a replay loop rather than a redesign.
 */

/** Cache names, so a test and a devtools panel call them the same thing. */
export const CACHE_IMAGES = "sticker-images";
export const CACHE_API = "sticker-api";
export const CACHE_FONTS = "sticker-fonts";

export const pwaOptions: Partial<VitePWAOptions> = {
  // `prompt`, not `autoUpdate`: a reload that happens by itself mid-tap loses
  // whatever the user was doing. `UpdateToast` asks first.
  registerType: "prompt",

  // The manifest is a real file in `public/` (H-01), hand-written and tested.
  // Letting the plugin generate a second one would leave two sources of truth.
  manifest: false,

  workbox: {
    // The shell, precached at install: HTML, JS, CSS and the fonts the first
    // paint needs. Splash images are deliberately absent — they are megabytes
    // that iOS reads from disk, not something the shell waits on.
    globPatterns: ["**/*.{html,js,css,woff2}", "icons/*.png", "manifest.webmanifest"],

    // A deep link opened offline has to resolve to the app, or the router never
    // gets a chance to render the route.
    navigateFallback: "index.html",

    // ...but an API request must NEVER fall back to HTML. Without this an
    // offline `GET /api/tasks` returns index.html, and the query layer fails
    // trying to parse a document as JSON — a confusing error a long way from
    // its cause.
    navigateFallbackDenylist: [/^\/api\//],

    runtimeCaching: [
      {
        /**
         * Images are content-addressed — the bytes at `img/<sha256>.jpg` can
         * never change — which is the only reason `CacheFirst` is safe here.
         *
         * GET is explicit. The upload is a PUT to the same path, and caching a
         * request that *writes* would be absurd; Workbox happens to default a
         * route to GET, but relying on that default silently is how the dead
         * rule below came about.
         */
        urlPattern: ({ url, request }: { url: URL; request: Request }) =>
          url.pathname.startsWith("/api/images/") && request.method === "GET",
        handler: "CacheFirst",
        options: {
          cacheName: CACHE_IMAGES,
          // 200 only. A cached 401 would pin a signed-out state into the
          // browser until someone cleared the cache by hand.
          cacheableResponse: { statuses: [200] },
          expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
      {
        /**
         * Reads render from the last-seen copy immediately and refresh behind
         * it. Images are matched above and excluded here, or they would be
         * revalidated on every view for no benefit.
         */
        urlPattern: ({ url, request }: { url: URL; request: Request }) =>
          url.pathname.startsWith("/api/") &&
          !url.pathname.startsWith("/api/images/") &&
          request.method === "GET",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: CACHE_API,
          cacheableResponse: { statuses: [200] },
        },
      },
      // There is deliberately **no rule for mutations**.
      //
      // A `NetworkOnly` entry looks reassuring and does nothing: Workbox
      // registers a route for GET unless told otherwise, so a matcher of
      // `method !== "GET"` can never fire — it compiles to dead code in the
      // generated worker. Workbox's router simply does not respond to requests
      // no route matches, so a POST reaches the network untouched, which is
      // exactly what is wanted. The invariant worth asserting is therefore
      // "nothing matches a mutation", and `test/pwa.test.ts` asserts it.
      {
        urlPattern: /\.woff2$/,
        handler: "CacheFirst",
        options: {
          cacheName: CACHE_FONTS,
          expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
    ],
  },

  // The dev server does not need a service worker in the way; caching while
  // editing is how you spend an hour debugging a stale bundle.
  devOptions: { enabled: false },
};
