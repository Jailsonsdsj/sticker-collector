import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_READY } from "./index.js";

describe("shared package", () => {
  it("is wired up", () => {
    expect(SHARED_PACKAGE_READY).toBe(true);
  });
});
