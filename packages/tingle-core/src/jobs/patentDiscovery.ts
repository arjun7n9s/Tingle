import type { TingleConfig } from "../config.js";
import type { PileableHit } from "../piles.js";
import { fetchSerp } from "../serp.js";

const DISCOVERY_CAP = 8;

export type PatentDiscoveryResult = {
  rows: PileableHit[];
  skipped?: string;
  failed: string[];
};

const PATENT_HOSTS = new Set([
  "patents.google.com",
  "patentscope.wipo.int",
  "worldwide.espacenet.com",
  "lens.org",
]);

/**
 * SERP adjunct: find public patent URLs for a claim.
 * Does not fetch patents.google.com (Unlocker refuses that host).
 * Titles/snippets come from SERP organic JSON, not the model.
 * Uses serpToken when set so a second Bright Data account is never mixed
 * into Studio collector calls.
 */
export async function fetchPatentDiscovery(
  config: TingleConfig,
  query: string,
): Promise<PatentDiscoveryResult> {
  const q = query.trim();
  if (!q) return { rows: [], failed: [] };
  if (config.mock || !config.serpZone || !(config.serpToken || config.apiToken)) {
    return { rows: [], skipped: "serp_unconfigured", failed: [] };
  }

  const serp = await fetchSerp(config, [patentSerpQuery(q)], {
    maxQueries: 1,
    perQuery: 10,
  });
  if (serp.skipped) {
    return { rows: [], skipped: "serp_unconfigured", failed: [] };
  }

  const rows = serp.rows
    .filter((row) => isPatentDiscoveryUrl(row.url))
    .slice(0, DISCOVERY_CAP)
    .map((row) => ({
      ...row,
      source: "serp",
      home: true,
    }));

  return {
    rows,
    failed: serp.collectors_failed,
  };
}

export function patentSerpQuery(query: string): string {
  const clipped = query.replace(/\s+/g, " ").trim().slice(0, 120);
  return `site:patents.google.com ${clipped}`;
}

export function isPatentDiscoveryUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!PATENT_HOSTS.has(host)) return false;
    if (host === "patents.google.com") return /\/patent\//i.test(url.pathname);
    if (host === "lens.org") return /\/lens\//i.test(url.pathname);
    return url.pathname.length > 1;
  } catch {
    return false;
  }
}
