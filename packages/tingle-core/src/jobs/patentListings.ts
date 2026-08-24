import type { TingleConfig } from "../config.js";
import { fetchUnlockerMarkdown } from "../bd/unlocker.js";
import { googlePatentsUrl } from "../collectors.js";
import { fetchT } from "../edge/fetchT.js";
import type { PileableHit } from "../piles.js";

const LISTING_CAP = 12;
const UA = "Tingle/0.1 (claim-watch; +https://dev.to/t/indiehackers)";

const PATENT_HOSTS = new Set([
  "patents.google.com",
  "worldwide.espacenet.com",
  "patentscope.wipo.int",
  "lens.org",
]);

export type PatentListingResult = {
  rows: PileableHit[];
  skipped?: string;
  failed: string[];
};

/**
 * Studio's crawler cannot open patents.google.com ("endpoint is not supported").
 * When the pinned Patents collector returns nothing, pull listing cards through
 * Web Unlocker, then a public Google Patents search. Titles come from the page,
 * not the model. Missing zone still tries the public search.
 */
export async function fetchPatentListings(
  config: TingleConfig,
  query: string,
  opts?: { country?: string },
): Promise<PatentListingResult> {
  const q = query.trim();
  if (!q) return { rows: [], failed: [] };

  const targets = [
    googlePatentsUrl(q),
    `https://worldwide.espacenet.com/patent/search?q=${encodeURIComponent(q)}`,
    `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(q)}`,
  ];
  for (const url of targets) {
    try {
      const result = await fetchUnlockerMarkdown(config, url, {
        country: opts?.country,
        zone: config.premiumUnlockerZone,
        token: config.unlockerToken,
      });
      if ("skipped" in result) {
        if (config.mock) return { rows: [], skipped: result.reason, failed: [] };
        const publicRows = await fetchGooglePatentsPublic(q);
        return publicRows.length
          ? { rows: publicRows, failed: [] }
          : { rows: [], skipped: result.reason, failed: [] };
      }
      if (isUnlockerHostBlock(result.markdown)) continue;
      const rows = parsePatentListingMarkdown(result.markdown).slice(0, LISTING_CAP);
      if (rows.length) return { rows, failed: [] };
    } catch {
      /* try the next office, then the public search */
    }
  }
  if (!config.mock) {
    const publicRows = await fetchGooglePatentsPublic(q);
    if (publicRows.length) return { rows: publicRows, failed: [] };
  }
  return { rows: [], failed: [] };
}

export function isUnlockerHostBlock(markdown: string): boolean {
  const text = markdown.trim().toLowerCase();
  return (
    text.includes("this endpoint is not supported") ||
    text.includes("requested site is not available for immediate residential") ||
    text.includes("bad_endpoint")
  );
}

export function parsePatentListingMarkdown(markdown: string): PileableHit[] {
  const seen = new Set<string>();
  const rows: PileableHit[] = [];
  const linked =
    /\[([^\]]+)\]\((https:\/\/(?:patents\.google\.com\/patent\/|worldwide\.espacenet\.com\/|patentscope\.wipo\.int\/|www\.lens\.org\/)[^)\s]+)\)/gi;
  for (const match of markdown.matchAll(linked)) {
    const title = (match[1] ?? "").trim();
    const url = unwrapPatentUrl(match[2] ?? "");
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    rows.push(listingHit(title, url, snippetNear(markdown, match.index ?? 0)));
  }
  const bare =
    /https:\/\/(?:patents\.google\.com\/patent\/[A-Za-z0-9]+|worldwide\.espacenet\.com\/[^\s)]+|patentscope\.wipo\.int\/search\/[^\s)]+|www\.lens\.org\/lens\/patent\/[^\s)]+)/gi;
  for (const match of markdown.matchAll(bare)) {
    const url = unwrapPatentUrl(match[0] ?? "");
    if (!url || seen.has(url)) continue;
    const id = patentIdFromUrl(url);
    if (!id) continue;
    seen.add(url);
    rows.push(listingHit(id, url, snippetNear(markdown, match.index ?? 0)));
  }
  return rows;
}

/**
 * Public Google Patents XHR — real publication numbers from Google, not the model.
 */
export async function fetchGooglePatentsPublic(query: string): Promise<PileableHit[]> {
  const q = query.trim();
  if (!q) return [];
  const inner = `q=${q}&num=10`;
  const url = `https://patents.google.com/xhr/query?url=${encodeURIComponent(inner)}&exp=`;
  try {
    const res = await fetchT(
      url,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
      12_000,
    );
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim() || text.trimStart().startsWith("<")) return [];
    return parseGooglePatentsXhr(JSON.parse(text)).slice(0, LISTING_CAP);
  } catch {
    return [];
  }
}

export function parseGooglePatentsXhr(body: unknown): PileableHit[] {
  const rows: PileableHit[] = [];
  const seen = new Set<string>();
  walkPatents(body, rows, seen);
  return rows;
}

function walkPatents(node: unknown, rows: PileableHit[], seen: Set<string>): void {
  if (!node || rows.length >= LISTING_CAP) return;
  if (Array.isArray(node)) {
    for (const item of node) walkPatents(item, rows, seen);
    return;
  }
  if (typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  const nested = rec.patent;
  if (nested && typeof nested === "object") {
    walkPatents(nested, rows, seen);
  }
  const num = str(
    rec.publication_number ?? rec.publicationNumber ?? rec.patent_id ?? rec.id,
  );
  const title = str(rec.title ?? rec.invention_title ?? rec.inventionTitle);
  if (num && isPubNo(num)) {
    const id = num.replace(/-/g, "");
    const url = `https://patents.google.com/patent/${encodeURIComponent(id)}`;
    if (!seen.has(url)) {
      seen.add(url);
      rows.push(
        listingHit(
          title || id,
          url,
          str(rec.snippet ?? rec.abstract ?? rec.result_preview) || title || id,
        ),
      );
    }
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === "patent") continue;
    walkPatents(value, rows, seen);
  }
}

function isPubNo(raw: string): boolean {
  return /^[A-Z]{1,4}-?\d{4,}[A-Z0-9-]*$/i.test(raw.trim());
}

function str(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function listingHit(title: string, url: string, snippet: string): PileableHit {
  return {
    source: "patent",
    title,
    url,
    snippet: snippet || title,
    published_at: null,
    source_domain: hostOf(url),
    collector: "patent",
    home: true,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "patents.google.com";
  } catch {
    return "patents.google.com";
  }
}

function unwrapPatentUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return "";
    const host = url.hostname.replace(/^www\./, "");
    if (!PATENT_HOSTS.has(host)) return "";
    if (host === "patents.google.com" && !/\/patent\//i.test(url.pathname)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function patentIdFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts[0] === "patent" && parts[1]) return decodeURIComponent(parts[1]).trim();
    const last = parts.at(-1) ?? "";
    return decodeURIComponent(last).trim() || url;
  } catch {
    return "";
  }
}

function snippetNear(markdown: string, at: number): string {
  const window = markdown.slice(at, at + 280).replace(/\s+/g, " ").trim();
  const cleaned = window
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https:\/\/\S+/g, "")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 8) return "";
  return cleaned.slice(0, 240);
}
