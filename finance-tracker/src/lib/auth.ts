import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ft_session";
export const SESSION_DAYS = 30;

export function hashPassword(p: string): Promise<string> {
  return hash(p);
}

export async function verifyPassword(stored: string, p: string): Promise<boolean> {
  try {
    return await verify(stored, p);
  } catch {
    return false;
  }
}

const enc = (s: string) => new TextEncoder().encode(s);

export function createSession(secret: string): Promise<string> {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(enc(secret));
}

export async function verifySession(token: string, secret: string): Promise<boolean> {
  try {
    await jwtVerify(token, enc(secret));
    return true;
  } catch {
    return false;
  }
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set in .env.local");
  return s;
}
