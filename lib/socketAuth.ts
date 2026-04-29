/** Verify NextAuth session from Socket.IO handshake cookies. */

import { decode } from "next-auth/jwt";

const SESSION_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export async function verifySocketSession(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) return null;
  const cookieMatch = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!cookieMatch) return null;
  const token = await decode({
    token: cookieMatch[1],
    salt: SESSION_COOKIE_NAME,
    secret: process.env.AUTH_SECRET!,
  });
  return (token?.sub as string) ?? null;
}

export const SOCKET_CORS_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
  : [process.env.NEXTAUTH_URL ?? "http://localhost:3000"];
