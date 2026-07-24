import { base64ToBytes, bytesToBase64 } from "./bytes";

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
