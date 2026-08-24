import { searchPhrasesFromClaim } from "../claim.js";
import type { TingleConfig } from "../config.js";
import type { PileableHit } from "../piles.js";
import { fetchSerp } from "../serp.js";

const PATENT_SITES = [
  "patents.google.com",
  "patentscope.wipo.int",
  "worldwide.espacenet.com",
  "patentsview.org",
  "lens.org",
] as const;

const REGIONAL: Array<{ engine: string; url: (q: string) => string }> = [
  {
    engine: "yandex",
    url: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}`,
  },
  {
    engine: "baidu",
    url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
  },
  {
    engine: "naver",
    url: (q) =>
      `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`,
  },
];

export function patentSiteQueries(claim: string): string[] {
  const q =
    searchPhrasesFromClaim(claim)[0] ??
    claim.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!q) return [];
  return PATENT_SITES.map((site) => `site:${site} ${q}`);
}

export type SerpDiscoveryResult = {
  rows: PileableHit[];
  failed: string[];
  skipped?: string;
  /** Per (source, query) URL lists for baseline diffs. */
  snapshots: Record<string, string[]>;
};

/**
 * Five Google `site:` queries → organic patent URLs.
 * Adjunct. Never a Studio collector. Titles come from SERP JSON.
 * One SERP call per site so snapshots can diff each query.
 */
export async function fetchPatentSerpDiscovery(
  config: TingleConfig,
  claim: string,
): Promise<SerpDiscoveryResult> {
  const queries = patentSiteQueries(claim);
  if (!queries.length) return { rows: [], failed: [], snapshots: {} };
  const rows: PileableHit[] = [];
  const failed: string[] = [];
  const snapshots: Record<string, string[]> = {};
  for (const query of queries) {
    const serp = await fetchSerp(config, [query], { maxQueries: 1, perQuery: 10 });
    if (serp.skipped) return { rows: [], failed: [], skipped: "serp_unconfigured", snapshots: {} };
    failed.push(...serp.collectors_failed);
    const tagged = serp.rows.map((row) => ({ ...row, source: "serp", home: true }));
    rows.push(...tagged);
    snapshots[`serp::patent::${query}`] = tagged.map((r) => r.url);
  }
  return { rows, failed, snapshots };
}

export function stampRegional(row: PileableHit, engine: string): PileableHit {
  return { ...row, source: "serp", home: false, region: engine };
}

/**
 * Yandex / Baidu / Naver SERP for "shipping in another region."
 * Tag by the engine we queried, not the result host (results are product pages).
 * Adjunct. Failures stay labeled — a 502 is not an empty niche.
 */
export async function fetchRegionalSerp(
  config: TingleConfig,
  claim: string,
): Promise<SerpDiscoveryResult> {
  const q =
    searchPhrasesFromClaim(claim)[0] ??
    claim.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!q) return { rows: [], failed: [], snapshots: {} };
  const rows: PileableHit[] = [];
  const failed: string[] = [];
  const snapshots: Record<string, string[]> = {};
  for (const r of REGIONAL) {
    const serp = await fetchSerp(config, [r.url(q)], { maxQueries: 1, perQuery: 5 });
    if (serp.skipped) return { rows: [], failed: [], skipped: "serp_unconfigured", snapshots: {} };
    failed.push(...serp.collectors_failed);
    const tagged = serp.rows.map((row) => stampRegional(row, r.engine));
    rows.push(...tagged);
    snapshots[`serp::regional::${r.engine}::${q}`] = tagged.map((row) => row.url);
  }
  return { rows, failed, snapshots };
}
