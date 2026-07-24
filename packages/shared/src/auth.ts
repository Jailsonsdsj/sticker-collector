import { z } from "zod";

// Auth wire contracts. One schema, two consumers (the Worker validates requests,
// the browser types its fetches). See architecture.md §0.2 for the flow:
// the passphrase is stretched with PBKDF2 in the BROWSER; the server only ever
// sees the derived authKey, never the passphrase.

// GET /api/auth/salt — the salt is not secret; it lets the client run the KDF.
export const saltResponseSchema = z.object({
  salt: z.string(), // base64
  iterations: z.number().int().positive(),
});
export type SaltResponse = z.infer<typeof saltResponseSchema>;

// POST /api/auth/login — authKey = base64(PBKDF2-SHA256(passphrase, salt, iterations)).
export const loginRequestSchema = z.object({
  authKey: z.string().min(1), // base64 of 32 bytes
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// The signed HS256 JWT is returned in the body AND set as an HttpOnly cookie.
export const loginResponseSchema = z.object({
  token: z.string(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
