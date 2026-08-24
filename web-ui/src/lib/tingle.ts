/**
 * Browser calls go same-origin through `/tingle-api`.
 * next.config.ts rewrites that to TINGLE_API_PROXY (local: 127.0.0.1:8788,
 * Vercel: https://api.tejs.dev). Do not add an App Router proxy — Vercel was
 * compiling it to a static 500 page.
 */
export function tingleApiBase(): string {
  if (typeof window !== "undefined") return "/tingle-api";
  return (
    process.env.NEXT_PUBLIC_TINGLE_API_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8788"
  );
}

export async function tingle<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${tingleApiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || `Tingle API ${res.status}`);
  }
  return body;
}
