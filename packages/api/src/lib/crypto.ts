import { base64ToBytes, bytesToBase64 } from "@sticker-collector/shared";

// Server-side crypto. Deliberately cheap: one SHA-256 per login, never PBKDF2 —
// the KDF runs on the client (architecture.md §0.2), keeping every invocation well
// under the free-tier 10ms CPU budget. Base64 helpers come from shared so the
// client's authKey encoding and the server's decoding are guaranteed identical.

export { base64ToBytes, bytesToBase64 };

export async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToBase64(new Uint8Array(digest));
}

// Length-independent constant-time comparison of two strings. Compares the full
// length of both operands so timing does not leak how many characters matched.
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < ba.length; i++) {
    // index into bb modulo its length so we always read a byte; the length XOR
    // above still forces a mismatch when the lengths differ.
    diff |= (ba[i] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return diff === 0;
}
