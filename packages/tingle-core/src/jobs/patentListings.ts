import type { TingleConfig } from "../config.js";
import { fetchUnlockerMarkdown } from "../bd/unlocker.js";
import { googlePatentsUrl } from "../collectors.js";
import type { PileableHit } from "../piles.js";

const LISTING_CAP = 12;

export type PatentListingResult = {
  rows: PileableHit[];
  skipped?: string;
  failed: string[];
};

/**
 * Studio's crawler cannot open patents.google.com ("endpoint is not supported").
 * When the pinned Patents collector returns nothing, pull listing cards through
 * Web Unlocker. Titles come from the page, not the model. Missing zone skips.
 */
export async function fetchPatentListings(
  config: TingleConfig,
  query: string,
  opts?: { country?: string },
): Promise<PatentListingResult> {
  const q = query.trim();
  if (!q) return { rows: [], failed: [] };

  try {
    const result = await fetchUnlockerMarkdown(config, googlePatentsUrl(q), {
      country: opts?.country,
      zone: config.premiumUnlockerZone,
      token: config.unlockerToken,
    });
    if ("skipped" in result) {
      return { rows: [], skipped: result.reason, failed: [] };
    }
    if (isUnlockerHostBlock(result.markdown)) {
      return {
        rows: [],
        failed: [
          "unlocker:listing: patents.google.com refused by Unlocker (this endpoint is not supported)",
        ],
      };
    }
    return {
      rows: parsePatentListingMarkdown(result.markdown).slice(0, LISTING_CAP),
      failed: [],
    };
  } catch (err) {
    return {
      rows: [],
      failed: [
        `unlocker:listing: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
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
    /\[([^\]]+)\]\((https:\/\/patents\.google\.com\/patent\/[^)\s]+)\)/gi;
  for (const match of markdown.matchAll(linked)) {
    const title = (match[1] ?? "").trim();
    const url = unwrapPatentUrl(match[2] ?? "");
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    rows.push(listingHit(title, url, snippetNear(markdown, match.index ?? 0)));
  }
  const bare = /https:\/\/patents\.google\.com\/patent\/[A-Za-z0-9]+[^)\s]*/gi;
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

function listingHit(title: string, url: string, snippet: string): PileableHit {
  return {
    source: "patent",
    title,
    url,
    snippet: snippet || title,
    published_at: null,
    source_domain: "patents.google.com",
    collector: "patent",
    home: true,
  };
}

function unwrapPatentUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return "";
    if (url.hostname.replace(/^www\./, "") !== "patents.google.com") return "";
    if (!/\/patent\//i.test(url.pathname)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function patentIdFromUrl(url: string): string {
  try {
    const part = new URL(url).pathname.split("/").filter(Boolean)[1] ?? "";
    return decodeURIComponent(part).trim();
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
