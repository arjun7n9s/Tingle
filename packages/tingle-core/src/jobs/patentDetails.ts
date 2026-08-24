import type { TingleConfig } from "../config.js";
import { fetchUnlockerMarkdown } from "../bd/unlocker.js";
import type { PileableHit } from "../piles.js";
import { extractPatentMarkdown } from "./patentExtract.js";

const CHEAP_CAP = 2;
const DEEP_CAP = 4;

export type PatentDetailResult = {
  hits: PileableHit[];
  fetched: number;
  attempted: number;
  skipped?: string;
  failed: string[];
};

/**
 * After a Google Patents listing row exists, optionally fetch a few public
 * HTTPS detail pages through Web Unlocker. Does not invent titles. Missing
 * zone skips. Caps cheap/deep so a look cannot spend Unlocker credits on
 * every card.
 */
export async function enrichPatentDetails(
  config: TingleConfig,
  hits: PileableHit[],
  opts?: { deep?: boolean; country?: string },
): Promise<PatentDetailResult> {
  const cap = opts?.deep ? DEEP_CAP : CHEAP_CAP;
  const targets = uniqueDetailUrls(hits).slice(0, cap);
  if (!targets.length) {
    return { hits, fetched: 0, attempted: 0, failed: [] };
  }

  const markdownByUrl = new Map<string, string>();
  const failed: string[] = [];
  let skipped: string | undefined;
  let fetched = 0;

  for (const url of targets) {
    try {
      const result = await fetchUnlockerMarkdown(config, url, {
        country: opts?.country,
        zone: config.premiumUnlockerZone,
        token: config.unlockerToken,
      });
      if ("skipped" in result) {
        skipped = result.reason;
        break;
      }
      const extracted = await extractPatentMarkdown(result.markdown, config.llm);
      const text = extracted || markdownToSnippet(result.markdown);
      if (text) {
        markdownByUrl.set(url, text);
        fetched += 1;
      }
    } catch (err) {
      failed.push(
        `unlocker:${hostOf(url)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!markdownByUrl.size) {
    return { hits, fetched, attempted: targets.length, skipped, failed };
  }

  return {
    hits: hits.map((hit) => {
      const text = markdownByUrl.get(hit.url);
      if (!text) return hit;
      if (!hit.title.trim()) return hit;
      if ((hit.snippet ?? "").trim().length >= text.length) return hit;
      return { ...hit, snippet: text };
    }),
    fetched,
    attempted: targets.length,
    skipped,
    failed,
  };
}

export function isPatentDetailUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname;
  // patents.google.com is refused by Unlocker on every Bright Data account
  // we have tested. SERP may still *discover* those URLs; do not spend
  // Unlocker credits fetching them.
  if (host === "patents.google.com") return false;
  return DETAIL_HOSTS.has(host) && path.length > 1;
}

const DETAIL_HOSTS = new Set([
  "ppubs.uspto.gov",
  "patentscope.wipo.int",
  "worldwide.espacenet.com",
  "epub.cnipa.gov.cn",
  "j-platpat.inpit.go.jp",
  "eng.kipris.or.kr",
  "ip2.sg",
  "fips.ru",
]);

function uniqueDetailUrls(hits: PileableHit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of hits) {
    if (!isPatentDetailUrl(hit.url) || seen.has(hit.url)) continue;
    seen.add(hit.url);
    out.push(hit.url);
  }
  return out;
}

function markdownToSnippet(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 8) return "";
  return text.slice(0, 500);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unlocker";
  }
}
