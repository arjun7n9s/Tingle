import type http from "node:http";
import { ClientError } from "./clientError.js";

type Bucket = { count: number; windowStart: number };

const hourBuckets = new Map<string, Bucket>();
let dayKey = "";
let dayCount = 0;

export function clientIp(req: http.IncomingMessage): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Live Studio runs cost credits. Anonymous callers get a hard ceiling.
 * Signed-in users skip this; project budget still applies.
 */
export function assertAnonLookAllowed(
  req: http.IncomingMessage,
  opts: { mock: boolean; signedIn: boolean },
): void {
  if (opts.mock || opts.signedIn) return;
  if (process.env.TINGLE_ALLOW_ANON_LIVE === "0") {
    throw new ClientError("sign in to run a live look", 401);
  }
  const perHour = Number(process.env.TINGLE_ANON_LOOKS_PER_HOUR) || 5;
  const perDay = Number(process.env.TINGLE_ANON_LOOKS_PER_DAY) || 40;
  const ip = clientIp(req);
  const now = Date.now();
  const hour = hourBuckets.get(ip) ?? { count: 0, windowStart: now };
  if (now - hour.windowStart >= 60 * 60 * 1000) {
    hour.count = 0;
    hour.windowStart = now;
  }
  hour.count += 1;
  hourBuckets.set(ip, hour);
  const today = new Date().toISOString().slice(0, 10);
  if (dayKey !== today) {
    dayKey = today;
    dayCount = 0;
  }
  dayCount += 1;
  if (hour.count > perHour || dayCount > perDay) {
    throw new ClientError(
      "too many anonymous looks — sign in or wait before spending more scrape credits",
      429,
    );
  }
}
