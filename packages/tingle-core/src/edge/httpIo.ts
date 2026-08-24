import type http from "node:http";
import { ClientError } from "./clientError.js";

export const SESSION_COOKIE = "tingle_sid";

export function readCookie(
  req: http.IncomingMessage,
  name: string,
): string | undefined {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function setSessionCookie(
  res: http.ServerResponse,
  value: string,
  maxAge = 604800,
): void {
  res.setHeader("Set-Cookie", sessionCookieHeader(value, maxAge));
}

export function sessionCookieHeader(value: string, maxAge = 604800): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (
    process.env.TINGLE_SECURE_COOKIES === "1" ||
    process.env.TINGLE_PUBLIC_URL?.startsWith("https")
  ) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function json(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function redirect(
  res: http.ServerResponse,
  location: string,
  cookie?: string,
): void {
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.writeHead(302, { Location: location });
  res.end();
}

export function readJson(req: http.IncomingMessage): Promise<unknown> {
  const max = 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c) => {
      const buf = c as Buffer;
      total += buf.length;
      if (total > max) {
        req.destroy();
        reject(new ClientError("request body too large", 413));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ClientError("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function strs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
}
