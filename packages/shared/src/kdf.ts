import { base64ToBytes, bytesToBase64 } from "./bytes";

/**
 * The KDF cost, in one place.
 *
 * It was previously written down nowhere and typed out everywhere — `seed.sql`,
 * `verify-triggers.sh`, `architecture.md` and every API test fixture each
 * carried their own `600000`. `deriveAuthKey` takes it as a parameter because
 * login reads the *stored* value from the user row (which is what lets the cost
 * be raised later without locking anyone out), but provisioning a NEW user has
 * to choose a number, and that choice belongs here rather than in whichever
 * script is being written that day.
 */
export const KDF_ITERATIONS = 600_000;

/** 16 bytes — the salt is not secret (architecture.md §0.2), only unique. */
export const SALT_BYTES = 16;

/**
 * A fresh salt, base64-encoded exactly as `kdf_salt` stores it and
 * `deriveAuthKey` expects it.
 *
 * Generating a salt is two lines and the encoding is the part that goes wrong,
 * so it lives next to the function that consumes it rather than being
 * re-derived by each caller.
 */
export function generateSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

// Client-side passphrase stretching (architecture.md §0.2).
//
// This runs the full 600k PBKDF2 iterations that the Worker cannot afford on the
// free tier's 10ms CPU budget. It MUST run on the device — the browser at login,
// tests/seed when provisioning. The Worker never calls this; it only SHA-256s the
// result (packages/api/src/lib/crypto.ts). The passphrase never leaves the client.
export async function deriveAuthKey(
  passphrase: string,
  saltB64: string,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltB64) as BufferSource, iterations },
    keyMaterial,
    256, // 32 bytes
  );
  return bytesToBase64(new Uint8Array(bits));
}
