/** Shared token generation and hashing utilities. */

import crypto from "crypto";

export const INVITE_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateHashedToken(): { rawToken: string; hashedToken: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  return { rawToken, hashedToken };
}
