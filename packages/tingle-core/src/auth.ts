import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  /** scrypt output, hex. */
  password_hash: z.string(),
  password_salt: z.string(),
  created_at: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const SessionSchema = z.object({
  token: z.string(),
  user_id: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

const KEYLEN = 64;

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEYLEN);
  return { hash: derived.toString("hex"), salt: salt.toString("hex") };
}

export async function verifyPassword(
  password: string,
  hashHex: string,
  saltHex: string,
): Promise<boolean> {
  const derived = await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    KEYLEN,
  );
  const expected = Buffer.from(hashHex, "hex");
  // Constant-time, and length-checked first because timingSafeEqual throws on
  // a mismatch rather than returning false.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/**
 * Email is the identity. That is the whole signup.
 *
 * Deliberately no OAuth here: identity and data source are separate concerns,
 * and asking for repo access at the door loses everyone who has no public
 * repository for the thing they are building. A repo is a project input,
 * requested later and only if they turn that toggle on.
 */
export function newUser(email: string, hash: string, salt: string): User {
  return {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    password_hash: hash,
    password_salt: salt,
    created_at: new Date().toISOString(),
  };
}

export function newSession(userId: string, days = 30): Session {
  const now = new Date();
  return {
    token: randomBytes(32).toString("hex"),
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + days * 86_400_000).toISOString(),
  };
}

export function sessionValid(s: Session, now = new Date()): boolean {
  return new Date(s.expires_at).getTime() > now.getTime();
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "password needs at least 10 characters";
  return null;
}

export const COOKIE = "tingle_session";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string, days = 30): string {
  return [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${days * 86_400}`,
  ].join("; ");
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
