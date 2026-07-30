// Base64 <-> bytes, shared by the browser KDF and the Worker's hash verification
// so both sides encode identically. Uses atob/btoa, available in browsers, the
// Workers runtime, and Node 18+.

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * SHA-256 as lowercase hex. Both sides of the image upload call this — the
 * browser to address the bytes it is about to send, the Worker to verify that
 * address before storing them — so a mismatch can only mean the bytes changed,
 * never that the two implementations disagree.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
