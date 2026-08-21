import { createHash } from "node:crypto";
import { normalizeText, tokenize, type Fingerprints } from "./claim.js";
import { isWithinDays, parseListingDate } from "./dates.js";
import { domainFromUrl, type HitRow } from "./schema/hits.js";

export type EnrichedHit = HitRow & {
  /** Stable across runs, so the second run is a diff and not a reprint. */
  id: string;
  /** Which lane produced this row. */
  origin: string;
  /** Detects "this page changed" for the baseline. */
  content_hash: string;
  /** Normalised date, plus how confidently it was read. */
  published_iso: string | null;
  date_precision: "exact" | "inferred-year" | "unparsed";
};

export type ScoredHit = EnrichedHit & {
  score: number;
  matched: string[];
  /** Why it landed in its pile, in plain language. */
  reason: string;
  /** Set when a Stand-on-this row is also inside the recency window. */
  also_recent?: boolean;
};

export type Piles = {
  stand_on_this: ScoredHit[];
  already_in_the_lane: ScoredHit[];
  shipped_last_7_days: ScoredHit[];
};

export type PileResult = {
  piles: Piles;
  /** Everything excluded, and why. An unexplained drop is indistinguishable
   *  from a scraper that never returned the row. */
  filtered: Array<{ url: string; title: string; why: string }>;
  quality: {
    hits_in: number;
    kept: number;
    below_threshold: number;
    ignored: number;
    undated: number;
  };
};

export function hitId(origin: string, url: string): string {
  return createHash("sha256").update(`${origin}|${url}`).digest("hex").slice(0, 16);
}

export function contentHash(row: Pick<HitRow, "title" | "snippet">): string {
  return createHash("sha256")
    .update(`${normalizeText(row.title)}|${normalizeText(row.snippet)}`)
    .digest("hex")
    .slice(0, 16);
}

export function enrichHit(row: HitRow, origin: string, now: Date): EnrichedHit {
  const parsed = parseListingDate(row.published_at, now);
  return {
    ...row,
    id: hitId(origin, row.url),
    origin,
    content_hash: contentHash(row),
    published_iso: parsed.iso,
    date_precision: parsed.precision,
  };
}

/**
 * Signals that a hit is something to build on rather than compete with.
 *
 * Tuned for precision over recall, per the spec: a wrong "stand on this" tells
 * someone to adopt a competitor, which is worse than omitting a real library.
 */
const REUSABLE_HOSTS = new Set([
  "arxiv.org","github.com","gitlab.com","codeberg.org","npmjs.com",
  "pypi.org","crates.io","packagist.org","rubygems.org","huggingface.co",
]);
const REUSABLE_WORDS =
  /\b(library|framework|sdk|open[-\s]?source|package|toolkit|boilerplate|starter|preprint|paper|specification|rfc)\b/i;

function looksReusable(hit: EnrichedHit): boolean {
  const host = domainFromUrl(hit.url);
  if (REUSABLE_HOSTS.has(host)) return true;
  if (/(^|\.)docs\./.test(host)) return true;
  if (/\/(docs|documentation)(\/|$)/.test(hit.url)) return true;
  if (/\/abs\//.test(hit.url)) return true;
  return REUSABLE_WORDS.test(`${hit.title} ${hit.snippet}`);
}

/**
 * Score a hit against the claim's fingerprints.
 *
 * Two-word phrases are worth far more than single terms — "refund rate" places
 * something in a niche where "rate" on its own places nothing. A hit needs a
 * phrase, or several distinct terms, to clear the threshold.
 */
export function scoreHit(
  hit: Pick<HitRow, "title" | "snippet">,
  fp: Fingerprints,
): { score: number; matched: string[] } {
  const haystack = normalizeText(`${hit.title} ${hit.snippet}`);
  const tokens = new Set(tokenize(`${hit.title} ${hit.snippet}`));
  const matched: string[] = [];
  let score = 0;

  for (const phrase of fp.phrases) {
    if (haystack.includes(phrase)) {
      score += 3;
      matched.push(phrase);
    }
  }
  for (const term of fp.terms) {
    if (tokens.has(term)) {
      score += 1;
      matched.push(term);
    }
  }
  return { score, matched };
}

export type PileOptions = {
  now?: Date;
  /** Minimum score to appear at all. One phrase, or two distinct terms. */
  minScore?: number;
  recencyDays?: number;
  mustMatch?: string[];
  ignore?: string[];
};

function isIgnored(hit: EnrichedHit, ignore: string[]): string | null {
  const host = domainFromUrl(hit.url);
  const url = hit.url.toLowerCase();
  const title = normalizeText(hit.title);
  for (const raw of ignore) {
    const needle = raw.trim().toLowerCase();
    if (!needle) continue;
    if (host === needle || host.endsWith(`.${needle}`)) return raw;
    if (url.includes(needle)) return raw;
    if (title.includes(normalizeText(needle))) return raw;
  }
  return null;
}

/**
 * Sort hits into the three piles.
 *
 * No model runs here. The piles are a pure function of collector output plus
 * the claim's fingerprints, which is why nothing can appear in a pile that was
 * not in the JSON — it is structurally impossible rather than a promise.
 */
export function buildPiles(
  hits: EnrichedHit[],
  fp: Fingerprints,
  opts: PileOptions = {},
): PileResult {
  const now = opts.now ?? new Date();
  const minScore = opts.minScore ?? 3;
  const recencyDays = opts.recencyDays ?? 7;
  const mustMatch = (opts.mustMatch ?? []).map((m) => normalizeText(m)).filter(Boolean);
  const ignore = opts.ignore ?? [];

  const piles: Piles = {
    stand_on_this: [],
    already_in_the_lane: [],
    shipped_last_7_days: [],
  };
  const filtered: PileResult["filtered"] = [];
  let ignored = 0;
  let below = 0;
  let undated = 0;

  for (const hit of hits) {
    if (hit.date_precision === "unparsed") undated += 1;

    const ignoredBy = isIgnored(hit, ignore);
    if (ignoredBy) {
      ignored += 1;
      filtered.push({ url: hit.url, title: hit.title, why: `muted by "${ignoredBy}"` });
      continue;
    }

    const { score, matched } = scoreHit(hit, fp);
    const haystack = normalizeText(`${hit.title} ${hit.snippet}`);
    const forced = mustMatch.find((m) => haystack.includes(m));

    if (!forced && score < minScore) {
      below += 1;
      filtered.push({
        url: hit.url,
        title: hit.title,
        why: `score ${score} below threshold ${minScore}`,
      });
      continue;
    }

    const recent = isWithinDays(hit.published_iso, now, recencyDays);
    const base: ScoredHit = {
      ...hit,
      score: forced ? Math.max(score, minScore) : score,
      matched: forced ? [...matched, `must_match:${forced}`] : matched,
      reason: "",
    };

    // Kind wins over recency, so a brand-new library is still something to
    // build on rather than a competitor alarm. `also_recent` keeps that
    // visible instead of hiding it.
    if (looksReusable(hit)) {
      piles.stand_on_this.push({
        ...base,
        also_recent: recent || undefined,
        reason: matched.length
          ? `reusable source matching ${matched.slice(0, 3).join(", ")}`
          : "reusable source in the claim's area",
      });
    } else if (recent) {
      piles.shipped_last_7_days.push({
        ...base,
        reason: `published ${hit.published_iso?.slice(0, 10)}${
          hit.date_precision === "inferred-year" ? " (year inferred)" : ""
        }`,
      });
    } else {
      piles.already_in_the_lane.push({
        ...base,
        reason: matched.length
          ? `same job, matching ${matched.slice(0, 3).join(", ")}`
          : "same job",
      });
    }
  }

  for (const key of Object.keys(piles) as Array<keyof Piles>) {
    piles[key].sort((a, b) => b.score - a.score);
  }

  const kept =
    piles.stand_on_this.length +
    piles.already_in_the_lane.length +
    piles.shipped_last_7_days.length;

  return {
    piles,
    filtered,
    quality: {
      hits_in: hits.length,
      kept,
      below_threshold: below,
      ignored,
      undated,
    },
  };
}

/** Honest label for a pile, including when it is empty. */
export function pileLabel(key: keyof Piles, count: number): string {
  const names: Record<keyof Piles, string> = {
    stand_on_this: "Stand on this",
    already_in_the_lane: "Already in the lane",
    shipped_last_7_days: "Shipped in the last 7 days",
  };
  if (count > 0) return `${names[key]} (${count})`;
  const empty: Record<keyof Piles, string> = {
    stand_on_this: "Stand on this — nothing the collectors returned looks reusable",
    already_in_the_lane: "Already in the lane — nothing returned matched the claim",
    shipped_last_7_days: "Shipped in the last 7 days — nothing dated inside the window",
  };
  return empty[key];
}
