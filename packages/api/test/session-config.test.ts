import { describe, expect, it } from "vitest";
import { signingKey } from "../src/lib/session";

/**
 * Configuration that is missing should say so.
 *
 * Without this guard an unset `TOKEN_SIGNING_KEY` reaches hono as `undefined`
 * and comes back as "Cannot read properties of undefined (reading 'includes')"
 * from inside the JWT signer — a stack trace naming neither the variable nor
 * the file you need to create. It cost a full CI run to trace.
 */
describe("the signing key", () => {
  it("is returned when configured", () => {
    expect(signingKey({ TOKEN_SIGNING_KEY: "abc" } as Env)).toBe("abc");
  });

  it("names itself, and says how to set it, when missing", () => {
    const boom = () => signingKey({} as Env);

    expect(boom).toThrow(/TOKEN_SIGNING_KEY/);
    expect(boom).toThrow(/\.dev\.vars/);
    expect(boom).toThrow(/wrangler secret put/);
  });

  it("treats an empty string as unset, since it signs nothing", () => {
    expect(() => signingKey({ TOKEN_SIGNING_KEY: "" } as Env)).toThrow(/TOKEN_SIGNING_KEY/);
  });
});
