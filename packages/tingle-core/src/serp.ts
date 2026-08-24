import type { TingleConfig } from "./config.js";
import { fetchT } from "./edge/fetchT.js";
import type { PileableHit } from "./piles.js";
import { extraWatchUrls } from "./longTail.js";

export type SerpResult = {
  rows: PileableHit[];
  urls: string[];
  sources_used: string[];
  collectors_failed: string[];
  skipped: boolean;
};

type Organic = { title: string; url: string; snippet: string };

/**
 * Bright Data SERP zone — adjunct URL discovery only.
 * Mock or missing zone → skip. Never a Studio collector. Never Dataset Marketplace.
 */
export async function fetchSerp(
  config: TingleConfig,
  queries: string[],
  opts?: { maxQueries?: number; perQuery?: number },
): Promise<SerpResult> {
  const empty: SerpResult = {
    rows: [],
    urls: [],
    sources_used: [],
    collectors_failed: [],
    skipped: true,
  };
  const token = config.serpToken || config.apiToken;
  if (config.mock || !config.serpZone || !token) return empty;
  const maxQueries = opts?.maxQueries ?? 3;
  const perQuery = opts?.perQuery ?? 5;
  const used = queries.map((q) => q.trim()).filter(Boolean).slice(0, maxQueries);
  if (!used.length) return empty;

  const organics: Organic[] = [];
  const failed: string[] = [];
  for (const query of used) {
    try {
      const batch = await serpQuery(config, query, perQuery, token);
      organics.push(...batch);
    } catch (err) {
      failed.push(
        `serp: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  const rows: PileableHit[] = [];
  for (const o of organics) {
    if (!o.url || seen.has(o.url)) continue;
    seen.add(o.url);
    urls.push(o.url);
    rows.push({
      source: "serp",
      title: o.title || o.url,
      url: o.url,
      snippet: o.snippet || o.title || o.url,
      published_at: null,
      source_domain: hostOf(o.url),
    });
  }

  return {
    rows,
    urls,
    sources_used: rows.length ? ["serp"] : [],
    collectors_failed: failed,
    skipped: false,
  };
}

/** Long-tail public HTML only — same Watch collector, never a 4th c_*. */
export function serpWatchTargets(urls: string[], max = 5): string[] {
  return extraWatchUrls(urls).accepted.slice(0, max);
}

async function serpQuery(
  config: TingleConfig,
  query: string,
  perQuery: number,
  token: string,
): Promise<Organic[]> {
  const target = /^https?:\/\//i.test(query)
    ? query
    : `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&brd_json=1`;
  const res = await fetchT(
    "https://api.brightdata.com/request",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone: config.serpZone,
        url: target,
        format: "json",
      }),
    },
    25_000,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  return parseOrganic(body).slice(0, perQuery);
}

function parseOrganic(body: unknown): Organic[] {
  const root = unwrap(body);
  const lists = [
    asArr(root.organic),
    asArr(root.organic_results),
    asArr(root.organicResults),
    asArr(root.results),
  ];
  const out: Organic[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const url = str(r.link ?? r.url ?? r.href);
      const title = str(r.title ?? r.name);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      out.push({
        title: title || url,
        url,
        snippet: str(r.description ?? r.snippet ?? r.body ?? title),
      });
    }
    if (out.length) return out;
  }
  return out;
}

function unwrap(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const r = body as Record<string, unknown>;
  if (r.body && typeof r.body === "object") return r.body as Record<string, unknown>;
  if (typeof r.body === "string") {
    try {
      const parsed = JSON.parse(r.body) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      /* raw html — no organics */
    }
  }
  return r;
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "serp";
  } catch {
    return "serp";
  }
}
