import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_API, CACHE_IMAGES, pwaOptions } from "../pwa.config";

/**
 * The offline contract.
 *
 * The rules are asserted as **data**, which is why they live in `pwa.config.ts`
 * rather than inline in the vite config: a caching strategy is exactly the kind
 * of thing that looks right, ships, and turns out to be wrong on a train.
 *
 * What is *not* asserted here is the row's own criterion — "loads with the
 * network off" needs a browser. What these rule out is every way the config
 * could be wrong before the browser ever gets involved.
 */
const workbox = pwaOptions.workbox as NonNullable<typeof pwaOptions.workbox>;
const routes = workbox.runtimeCaching as NonNullable<typeof workbox.runtimeCaching>;

const matcher = (route: (typeof routes)[number]) => route.urlPattern;

const matches = (route: (typeof routes)[number], url: string, method = "GET"): boolean => {
  const pattern = matcher(route);
  const parsed = new URL(url, "https://example.test");
  if (pattern instanceof RegExp) return pattern.test(url);
  if (typeof pattern === "function") {
    return Boolean(
      (pattern as (arg: { url: URL; request: Request; sameOrigin: boolean }) => unknown)({
        url: parsed,
        request: { method } as Request,
        sameOrigin: true,
      }),
    );
  }
  return false;
};

const routeFor = (url: string, method = "GET") =>
  routes.find((route) => matches(route, url, method));

describe("images", () => {
  it("are served from the cache first", () => {
    // Safe only because they are content-addressed: the bytes at
    // `img/<sha256>.jpg` can never change.
    const route = routeFor("/api/images/img/abc.jpg");
    expect(route?.handler).toBe("CacheFirst");
    expect((route?.options as { cacheName?: string })?.cacheName).toBe(CACHE_IMAGES);
  });

  it("are cached only when the response was a 200", () => {
    // A cached 401 would pin a signed-out state into the browser until someone
    // cleared the cache by hand.
    const route = routeFor("/api/images/img/abc.jpg");
    const statuses = (route?.options as { cacheableResponse?: { statuses: number[] } })
      ?.cacheableResponse?.statuses;
    expect(statuses).toEqual([200]);
  });

  it("do not fall through to the network-first read rule", () => {
    // Matched first, and excluded there: otherwise every sticker would be
    // revalidated on every view for no benefit at all.
    const api = routes.find(
      (route) => (route.options as { cacheName?: string })?.cacheName === CACHE_API,
    );
    expect(api).toBeDefined();
    expect(matches(api as (typeof routes)[number], "/api/images/img/abc.jpg")).toBe(false);
  });
});

describe("reads", () => {
  it("go to the network first, falling back to the cache", () => {
    const route = routeFor("/api/tasks");
    expect(route?.handler).toBe("NetworkFirst");
    expect((route?.options as { cacheName?: string })?.cacheName).toBe(CACHE_API);
  });

  it("are never answered from cache while the network is available", () => {
    // Not a style preference. `StaleWhileRevalidate` here served the read that
    // a mutation had just invalidated from the *pre-mutation* cache: buying an
    // album's last sticker left the album showing as incomplete until the next
    // navigation. The e2e journey caught it; this pins it.
    for (const route of routes) {
      if ((route.options as { cacheName?: string })?.cacheName !== CACHE_API) continue;
      expect(route.handler).not.toBe("StaleWhileRevalidate");
      expect(route.handler).not.toBe("CacheFirst");
    }
  });

  it("give up on a slow network rather than hanging offline", () => {
    // Without a timeout, "network first" on a dead connection means waiting for
    // the browser's own timeout before the cached copy appears.
    const route = routeFor("/api/tasks");
    expect(
      (route?.options as { networkTimeoutSeconds?: number })?.networkTimeoutSeconds,
    ).toBeGreaterThan(0);
  });

  it("cover every read the app makes", () => {
    for (const path of [
      "/api/tasks",
      "/api/occurrences?from=2026-07-01&to=2026-07-31",
      "/api/albums",
      "/api/albums/alb1",
      "/api/wallet",
      "/api/reports/momentum",
    ]) {
      expect(routeFor(path)?.handler, path).toBe("NetworkFirst");
    }
  });
});

describe("mutations", () => {
  it("match no rule at all, so nothing intercepts them", () => {
    // Workbox only responds to requests a route matches, so "no rule" *is*
    // network-only. A `NetworkOnly` entry would be worse than nothing: routes
    // default to GET, so a `method !== "GET"` matcher compiles to dead code and
    // reads as protection that is not there.
    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      expect(routeFor("/api/occurrences/complete", method), method).toBeUndefined();
      expect(routeFor("/api/albums", method), method).toBeUndefined();
    }
  });

  it("does not let an image upload land in the image cache", () => {
    // Same path as the read, opposite direction.
    expect(routeFor("/api/images/img/abc.jpg", "PUT")).toBeUndefined();
  });

  it("are never queued for replay — that is the outbox, and it is not v1", () => {
    const serialised = JSON.stringify(routes);
    expect(serialised).not.toContain("BackgroundSync");
    expect(serialised).not.toContain("backgroundSync");
  });
});

describe("navigation", () => {
  it("falls back to the app so a deep link works offline", () => {
    expect(workbox.navigateFallback).toBe("index.html");
  });

  it("never falls back to HTML for an API request", () => {
    // Without this an offline `GET /api/tasks` returns index.html, and the query
    // layer fails parsing a document as JSON — far from the cause.
    const denied = workbox.navigateFallbackDenylist as RegExp[];
    expect(denied.some((pattern) => pattern.test("/api/tasks"))).toBe(true);
    expect(denied.some((pattern) => pattern.test("/albums/alb1"))).toBe(false);
  });
});

describe("the app icons", () => {
  it("are cached as they are seen, not precached", () => {
    // Four sets, ~1.3 MB, of which the app needs one. Precaching all four to
    // install a single icon is the trade `globPatterns` cannot express.
    const globs = (workbox.globPatterns as string[]).join(" ");
    expect(globs).not.toContain("app-icons");

    const rule = routeFor("/app-icons/star/icon-192.png");
    expect(rule?.handler).toBe("CacheFirst");
  });
});

describe("what gets precached", () => {
  it("includes the shell and the icons", () => {
    const globs = (workbox.globPatterns as string[]).join(" ");
    expect(globs).toContain("html");
    expect(globs).toContain("js");
    expect(globs).toContain("css");
    expect(globs).toContain("icons/*.png");
    // The coin is on the wallet and on every price; offline it must not be a
    // broken-image box.
    expect(globs).toContain("coin/*.png");
  });

  it("leaves the launch images out", () => {
    // Megabytes of iOS splash art that nothing waits on before first paint.
    const globs = (workbox.globPatterns as string[]).join(" ");
    expect(globs).not.toContain("splash");
  });
});

describe("registration", () => {
  it("asks before reloading", () => {
    // `autoUpdate` reloads the page whenever it likes, including mid-tap.
    expect(pwaOptions.registerType).toBe("prompt");
  });

  it("leaves the hand-written manifest alone", () => {
    expect(pwaOptions.manifest).toBe(false);
  });

  it("stays out of the dev server", () => {
    expect(pwaOptions.devOptions?.enabled).toBe(false);
  });
});

/**
 * The built worker. Skipped without a `dist/`, which is honest rather than
 * vacuous: CI runs `pnpm test` before `pnpm build`, so these run locally after a
 * build and the reason is stated when they do not.
 */
const root = [process.cwd(), resolve(process.cwd(), "packages/web")].find((dir) =>
  existsSync(resolve(dir, "index.html")),
) as string;
const swPath = resolve(root, "dist/sw.js");
const built = existsSync(swPath);

describe.skipIf(!built)("the generated service worker", () => {
  const sw = built ? readFileSync(swPath, "utf8") : "";

  it("precaches the shell it will serve offline", () => {
    // The closest this environment gets to the row's criterion: the entries the
    // worker will install are right there in the file.
    expect(sw).toContain("index.html");
    expect(sw).toMatch(/assets\/index-[\w-]+\.js/);
    expect(sw).toMatch(/assets\/index-[\w-]+\.css/);
  });

  it("carries the runtime rules, not just the precache list", () => {
    expect(sw).toContain(CACHE_IMAGES);
    expect(sw).toContain(CACHE_API);
  });
});
