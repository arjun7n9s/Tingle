import type { TingleConfig } from "./config.js";
import type { PileableHit } from "./piles.js";
import { domainFromUrl } from "./schema/hits.js";
import { adjunctSearchQuery } from "./adjunct.js";

export const MARKETPLACE_LABEL =
  "Dataset Marketplace / Deep Lookup / Firehose — labeled adjunct, not Scraper Studio, not in the first-look quality bar.";

/** Public Web Scraper API dataset ids. Not secrets. Not the qualifying path. */
export const CHATGPT_DATASET_ID = "gd_m7aof0k82r803d5bjm";
export const AI_MODE_DATASET_ID = "gd_mcswdt6z2elth3zqr2";

export type MarketplaceResult = {
  rows: PileableHit[];
  sources_used: string[];
  collectors_failed: string[];
  adjunct: true;
  label: string;
};

/**
 * Opt-in deep-lane extras. Cheap first look stays Search + Watch (+ JSON APIs).
 * Live uses Bright Data `/datasets/v3/scrape` then snapshot poll. Citations
 * become labeled hits. Firehose is a sales stream — skipped, never invented.
 */
export async function fetchMarketplaceAdjuncts(
  config: TingleConfig,
  opts: {
    fingerprints: string[];
    deep: boolean;
    claim?: string;
    prompts?: string[];
    pollMs?: number;
    allowEmpty?: boolean;
  },
): Promise<MarketplaceResult> {
  if (!opts.deep) {
    return {
      rows: [],
      sources_used: [],
      collectors_failed: [],
      adjunct: true,
      label: MARKETPLACE_LABEL,
    };
  }

  if (config.mock) return mockMarketplace(opts.fingerprints, opts.prompts);

  const prompts = (opts.prompts?.length
    ? opts.prompts
    : [
        adjunctSearchQuery(opts.claim, opts.fingerprints).slice(0, 500) ||
          "indie product watch",
      ]
  ).slice(0, 4);
  const jobs: Promise<{
    source: string;
    rows: PileableHit[];
    error?: string;
  }>[] = [];

  if (config.datasets.chatgpt) {
    jobs.push(
      safe("chatgpt_dataset", () =>
        collectDataset(config, {
          datasetId: config.datasets.chatgpt!,
          source: "chatgpt_dataset",
          allowEmpty: opts.allowEmpty,
          pollMs: opts.pollMs,
          input: prompts.map((prompt) => ({
            url: "https://chatgpt.com/",
            prompt,
            require_sources: true,
          })),
        }),
      ),
    );
  }
  if (config.datasets.aiMode) {
    jobs.push(
      safe("ai_mode_dataset", () =>
        collectDataset(config, {
          datasetId: config.datasets.aiMode!,
          source: "ai_mode_dataset",
          allowEmpty: opts.allowEmpty,
          pollMs: opts.pollMs,
          input: prompts.map((prompt) => ({
            url: `https://www.google.com/search?udm=50&q=${encodeURIComponent(prompt)}`,
            prompt,
            country: "US",
          })),
        }),
      ),
    );
  }
  jobs.push(
    Promise.resolve({
      source: "firehose",
      rows: [],
      error:
        "Data Firehose is a Bright Data sales stream (~1B records/day), not a prompt we can trigger. Skipped rather than invented.",
    }),
  );
  jobs.push(
    Promise.resolve({
      source: "deep_lookup",
      rows: [],
      error:
        "Deep Lookup is a Bright Data company-graph product. Not a Studio collector; skipped rather than invented.",
    }),
  );

  const settled = await Promise.all(jobs);
  const rows: PileableHit[] = [];
  const sources_used: string[] = [];
  const collectors_failed: string[] = [];
  for (const r of settled) {
    if (r.error) collectors_failed.push(`${r.source}: ${r.error}`);
    else {
      sources_used.push(r.source);
      rows.push(...r.rows);
    }
  }
  return { rows, sources_used, collectors_failed, adjunct: true, label: MARKETPLACE_LABEL };
}

function mockMarketplace(
  fingerprints: string[],
  prompts?: string[],
): MarketplaceResult {
  const q = prompts?.[0] || fingerprints[0] || "the confirmed claim";
  return {
    adjunct: true,
    label: MARKETPLACE_LABEL,
    sources_used: ["chatgpt_dataset", "ai_mode_dataset"],
    collectors_failed: [
      "firehose: Data Firehose is a Bright Data sales stream, not a prompt we can trigger",
      "deep_lookup: not wired as a Studio collector; skipped rather than invented",
    ],
    rows: [
      {
        source: "chatgpt_dataset",
        title: "Mock ChatGPT citation (adjunct)",
        url: "https://example.com/adjunct/chatgpt-citation",
        snippet: `Labeled Dataset Marketplace row matching “${q}”. Not Scraper Studio.`,
        published_at: null,
        source_domain: "example.com",
      },
      {
        source: "ai_mode_dataset",
        title: "Mock Google AI Mode citation (adjunct)",
        url: "https://example.com/adjunct/ai-mode-citation",
        snippet: `Labeled Dataset Marketplace row matching “${q}”. Not Scraper Studio.`,
        published_at: null,
        source_domain: "example.com",
      },
    ],
  };
}

async function collectDataset(
  config: TingleConfig,
  opts: {
    datasetId: string;
    source: string;
    input: Record<string, string | boolean>[];
    pollMs?: number;
    allowEmpty?: boolean;
  },
): Promise<PileableHit[]> {
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
    "Content-Type": "application/json",
  };
  const scrapeUrl = new URL("/datasets/v3/scrape", config.baseUrl);
  scrapeUrl.searchParams.set("dataset_id", opts.datasetId);
  scrapeUrl.searchParams.set("format", "json");
  const scrape = await fetch(scrapeUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.input),
    signal: AbortSignal.timeout(Math.min(120_000, opts.pollMs ?? 75_000)),
  });
  const scraped = await scrape.json().catch(() => ({}));
  const snapshotId = snapshotIdOf(scraped);
  const take = (rows: unknown[]) =>
    opts.allowEmpty ? parseMarketplaceRecords(opts.source, rows) : requireCitations(opts.source, rows);
  if (snapshotId) {
    const rows = await pollSnapshot(config, snapshotId, headers, opts.pollMs);
    return take(rows);
  }
  if (scrape.ok) {
    return take(asRecords(scraped));
  }
  const err =
    scraped && typeof scraped === "object"
      ? String((scraped as { error?: string }).error ?? scrape.status)
      : String(scrape.status);
  throw new Error(`dataset ${opts.datasetId} HTTP ${scrape.status}: ${err}`);
}

async function pollSnapshot(
  config: TingleConfig,
  snapshotId: string,
  headers: Record<string, string>,
  pollMs = 120_000,
): Promise<unknown[]> {
  const started = Date.now();
  while (Date.now() - started < pollMs) {
    const progress = await fetch(
      new URL(`/datasets/v3/progress/${encodeURIComponent(snapshotId)}`, config.baseUrl),
      { headers },
    );
    const body = (await progress.json().catch(() => ({}))) as { status?: string };
    const status = String(body.status ?? "").toLowerCase();
    if (status === "failed" || status === "error") {
      throw new Error(`dataset snapshot ${snapshotId} ${status}`);
    }
    if (status === "ready" || status === "done") {
      const snap = await fetch(
        new URL(
          `/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
          config.baseUrl,
        ),
        { headers },
      );
      if (!snap.ok) throw new Error(`snapshot download HTTP ${snap.status}`);
      const rows = await snap.json();
      return asRecords(rows);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`dataset snapshot ${snapshotId} timed out`);
}

/** Citations from ChatGPT / AI Mode payloads. Never invent URLs from the answer text. */
export function parseMarketplaceRecords(
  source: string,
  records: unknown[],
): PileableHit[] {
  const out: PileableHit[] = [];
  const seen = new Set<string>();
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const answer = str(
      r.answer || r.answer_text || r.answer_text_markdown || r.response || r.snippet,
    );
    for (const c of citationList(r)) {
      const hit = toHit(source, c.title || c.url, c.url, c.snippet || answer);
      if (!hit) continue;
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      out.push(hit);
    }
  }
  return out;
}

function requireCitations(source: string, records: unknown[]): PileableHit[] {
  const rows = parseMarketplaceRecords(source, records);
  if (!rows.length) {
    throw new Error("no citations in dataset output — not inventing rows");
  }
  return rows;
}

function asRecords(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    return [body];
  }
  throw new Error("dataset payload was not JSON records — not inventing rows");
}

function snapshotIdOf(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  return String((body as { snapshot_id?: string }).snapshot_id ?? "");
}

function citationList(r: Record<string, unknown>): {
  title: string;
  url: string;
  snippet?: string;
}[] {
  const buckets = [r.citations, r.search_sources, r.sources, r.links, r.organic];
  const parsed: {
    title: string;
    url: string;
    snippet?: string;
    cited?: boolean;
  }[] = [];
  for (const raw of buckets) {
    if (!Array.isArray(raw)) continue;
    for (const c of raw) {
      if (!c || typeof c !== "object") continue;
      const row = c as Record<string, unknown>;
      const url = str(row.url || row.link || row.href);
      if (!url || isSelfUrl(url)) continue;
      parsed.push({
        title: str(row.title || row.name) || url,
        url,
        snippet: str(row.snippet || row.description || row.text),
        cited: row.cited === true,
      });
    }
  }
  const cited = parsed.filter((c) => c.cited);
  return cited.length ? cited : parsed;
}

const SELF_HOSTS = new Set([
  "chatgpt.com",
  "chat.openai.com",
  "google.com",
  "google.co.in",
  "google.co.uk",
]);

function isSelfUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SELF_HOSTS.has(host);
  } catch {
    return true;
  }
}

function toHit(
  source: string,
  title: string,
  url: string,
  snippet: string,
): PileableHit | undefined {
  if (!title || !url) return undefined;
  try {
    new URL(url);
  } catch {
    return undefined;
  }
  return {
    source,
    title,
    url,
    snippet: (snippet || title).slice(0, 400),
    published_at: null,
    source_domain: domainFromUrl(url),
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safe(
  source: string,
  fn: () => Promise<PileableHit[]>,
): Promise<{ source: string; rows: PileableHit[]; error?: string }> {
  return fn()
    .then((rows) => ({ source, rows }))
    .catch((err: unknown) => ({
      source,
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    }));
}
