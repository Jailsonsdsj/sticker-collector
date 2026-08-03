import { beforeEach, describe, expect, it, vi } from "vitest";
import { appTimeZone, deviceTimeZone, setAppTimeZone, today } from "./timezone";

/**
 * The bug this module exists to end: the client resolved the local day from the
 * DEVICE while the server resolved it from `user.timezone`. For the hours the
 * two zones disagree, every undated one-off came back
 * `400: an undated task can only be completed today`.
 */
beforeEach(() => setAppTimeZone(deviceTimeZone()));

describe("which zone the app counts days in", () => {
  it("starts on the device's, which is all there is before /api/me answers", () => {
    expect(appTimeZone()).toBe(deviceTimeZone());
  });

  it("adopts the account's once it is known", () => {
    setAppTimeZone("Pacific/Kiritimati");
    expect(appTimeZone()).toBe("Pacific/Kiritimati");
  });

  it("ignores an empty zone rather than counting days in nothing", () => {
    setAppTimeZone("Asia/Tokyo");
    setAppTimeZone("");
    expect(appTimeZone()).toBe("Asia/Tokyo");
  });

  it("answers with a real zone when the device refuses to say", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation((() => {
      throw new Error("no");
    }) as unknown as typeof Intl.DateTimeFormat);

    expect(deviceTimeZone()).toBe("UTC");
    vi.restoreAllMocks();
  });
});

describe("what day it is", () => {
  it("is the day in the ACCOUNT's zone, not the device's", () => {
    // The whole point. Two zones a day apart give two different answers, and
    // the server only accepts one of them.
    vi.useFakeTimers();
    // 01:00 UTC: mid-morning on the 3rd in Tokyo (+9), still 22:00 on the 2nd
    // in São Paulo (-3). This is exactly the window the bug lived in.
    vi.setSystemTime(new Date("2026-08-03T01:00:00Z"));

    setAppTimeZone("Asia/Tokyo");
    expect(today()).toBe("2026-08-03");

    setAppTimeZone("America/Sao_Paulo");
    expect(today()).toBe("2026-08-02");

    vi.useRealTimers();
  });
});
