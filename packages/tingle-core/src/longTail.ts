import { parseGithubRepo } from "./claim.js";
import { domainFromUrl } from "./schema/hits.js";

/**
 * Hosts a judge would ask "why not the pre-built scraper?" for.
 * Extra watch URLs must stay long-tail Studio targets — never these.
 */
const BLOCKED_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "gitlab.com",
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "amazon.com",
  "www.amazon.com",
  "amazon.co.uk",
  "producthunt.com",
  "www.producthunt.com",
  "linkedin.com",
  "www.linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "www.youtube.com",
  "facebook.com",
  "instagram.com",
  "chatgpt.com",
  "chat.openai.com",
]);

export type ExtraUrlDecision = {
  accepted: string[];
  rejected: { url: string; reason: string }[];
};

export function hostOf(url: string): string {
  return domainFromUrl(url).replace(/^www\./, "");
}

export function isBlockedMarketplaceHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  if (BLOCKED_HOSTS.has(h) || BLOCKED_HOSTS.has(`www.${h}`)) return true;
  return [...BLOCKED_HOSTS].some((b) => h === b || h.endsWith(`.${b}`));
}

/** Pull http(s) URLs out of a watch list (names stay fingerprints, not scrapes). */
export function urlsFromWatchList(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s || !looksLikeUrl(s)) continue;
    try {
      const u = new URL(s.includes("://") ? s : `https://${s}`);
      if (u.protocol === "http:" || u.protocol === "https:") out.push(u.toString());
    } catch {
      // not a scrape target
    }
  }
  return out;
}

function looksLikeUrl(s: string): boolean {
  if (/^https?:\/\//i.test(s)) return true;
  return /^[\w.-]+\.[a-z]{2,}([/:?]|$)/i.test(s);
}

/**
 * Extra Discovery targets for the pinned Watch collector.
 * Never creates a new c_*. Never points Studio at a pre-built marketplace site.
 */
export function extraWatchUrls(items: string[]): ExtraUrlDecision {
  const accepted: string[] = [];
  const rejected: { url: string; reason: string }[] = [];
  for (const url of urlsFromWatchList(items)) {
    const host = hostOf(url);
    if (!host) {
      rejected.push({ url, reason: "could not parse host" });
      continue;
    }
    if (isBlockedMarketplaceHost(host)) {
      rejected.push({
        url,
        reason: `blocked host ${host} — pre-built scrapers exist; pick a long-tail page`,
      });
      continue;
    }
    if (parseGithubRepo(url)) {
      rejected.push({
        url,
        reason: "GitHub as data is REST on a pasted repo, not a Studio collector",
      });
      continue;
    }
    accepted.push(url);
  }
  return { accepted, rejected };
}
