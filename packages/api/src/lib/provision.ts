import { deriveAuthKey, generateSalt, KDF_ITERATIONS } from "@sticker-collector/shared";
import { base64ToBytes, sha256Base64 } from "./crypto";

/**
 * Turning a passphrase into the three columns the `user` row stores.
 *
 * This lives in `src/lib` rather than inside the provisioning script for one
 * reason: **the script must not own the definition of a valid credential.** The
 * login route verifies `sha256(base64decode(authKey))`, and if a script wrote
 * its own version of that, the two could drift and the only symptom would be an
 * account nobody can get into — discovered in production, on the one account
 * that exists.
 *
 * Instead this is imported by both the script and a test that provisions with
 * it and then calls the **real** `POST /api/auth/login`. Correctness is proven
 * against the actual verifier, not against a second copy of its logic.
 *
 * Note there is deliberately **no HTTP route** anywhere near this. A
 * provisioning endpoint on a single-user app is a permanent unauthenticated
 * write path to the only account; provisioning is a thing you do locally, once.
 */
export interface UserCredential {
  /** `user.auth_key_hash` — what the login route compares against. */
  authKeyHash: string;
  /** `user.kdf_salt` — not secret, only unique. */
  kdfSalt: string;
  /** `user.kdf_iterations` — returned by `/api/auth/salt` so the browser matches. */
  kdfIterations: number;
}

export async function deriveUserCredential(
  passphrase: string,
  salt: string = generateSalt(),
  iterations: number = KDF_ITERATIONS,
): Promise<UserCredential> {
  // Exactly the client's half: PBKDF2 on the device, because the Worker has a
  // 10ms CPU budget and cannot afford 600k iterations.
  const authKey = await deriveAuthKey(passphrase, salt, iterations);

  // ...and exactly the server's half, from the same module the login route
  // uses. `base64ToBytes` first — the route hashes the *decoded* 32 bytes, not
  // the base64 text, and hashing the wrong one produces a credential that is
  // wrong in a way nothing reveals until you try to log in.
  return {
    authKeyHash: await sha256Base64(base64ToBytes(authKey)),
    kdfSalt: salt,
    kdfIterations: iterations,
  };
}
