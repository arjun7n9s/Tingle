import { createHash } from "node:crypto";
import { isClaimRelevant } from "./claim.js";

export type PileableHit = {
  source: string;
  title: string;
  url: string;
  snippet: string;
  published_at: string | null;
  source_domain: string;
};

export const PILE_KEYS = [
  "stand_on_this",
  "already_in_the_lane",
  "shipped_last_7_days",
] as const;
export type PileKey = (typeof PILE_KEYS)[number];

export type PileHit = PileableHit & {
  id: string;
  why: string;
  collector: string;
  content_hash: string;
  entity_key: string;
  days_old: number | null;
};

export type Piles = Record<PileKey, PileHit[]>;

export type PileInput = {
  fingerprints: string[];
  must_match?: string[];
  ignore?: string[];
  now?: Date;
};

const STAND_HOSTS = new Set([
  "arxiv.org",
  "export.arxiv.org",
  "github.com",
  "gitlab.com",
  "npmjs.com",
  "pypi.org",
  "crates.io",
  "docs.rs",
  "readthedocs.io",
  "patents.google.com",
  "patentsview.org",
  "uspto.gov",
  "developer.uspto.gov",
]);

const STAND_TITLE =
  /\b(library|sdk|api|framework|docs?|documentation|paper|preprint|dataset|toolkit|engine|parser|package)\b/i;

export function hitId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export function contentHash(hit: Pick<PileableHit, "title" | "url" | "snippet">): string {
  return createHash("sha256")
    .update(`${hit.url}\n${hit.title}\n${hit.snippet}`)
    .digest("hex");
}

export function entityKey(hit: Pick<PileableHit, "title" | "url">): string {
  const host = (() => {
    try {
      return new URL(hit.url).hostname.replace(/^www\./, "");
    } catch {
      return hit.url;
    }
  })();
  const name = hit.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${host}::${name}`;
}

export function daysSince(publishedAt: string | null, now: Date): number | null {
  if (!publishedAt) return null;
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86_400_000;
}

function isStandOn(hit: PileableHit): boolean {
  if (STAND_HOSTS.has(hit.source_domain.replace(/^www\./, ""))) return true;
  if (hit.source === "search" && /github\.com/i.test(hit.url)) return true;
  return STAND_TITLE.test(`${hit.title} ${hit.snippet}`);
}

/**
 * Map validated hits into the three piles. Search/Watch listings are ranked
 * against the claim here — we do not interpolate `{q}` into the collector.
 * Empty piles are allowed; they are not filled from model memory.
 */
export function mapHitsToPiles(
  hits: PileableHit[],
  input: PileInput,
): Piles {
  const now = input.now ?? new Date();
  const piles: Piles = {
    stand_on_this: [],
    already_in_the_lane: [],
    shipped_last_7_days: [],
  };

  for (const hit of hits) {
    if (
      !isClaimRelevant(
        hit,
        input.fingerprints,
        input.must_match ?? [],
        input.ignore ?? [],
      )
    ) {
      continue;
    }

    const age = daysSince(hit.published_at, now);
    const piled: PileHit = {
      ...hit,
      id: hitId(hit.url),
      why: why(hit, age),
      collector: hit.source,
      content_hash: contentHash(hit),
      entity_key: entityKey(hit),
      days_old: age,
    };

    if (isStandOn(hit) && !(age !== null && age >= 0 && age <= 7)) {
      piles.stand_on_this.push(piled);
    } else if (age !== null && age >= 0 && age <= 7) {
      piles.shipped_last_7_days.push(piled);
    } else {
      piles.already_in_the_lane.push(piled);
    }
  }

  return piles;
}

function why(hit: PileableHit, age: number | null): string {
  if (isStandOn(hit)) {
    return `Matches the claim and looks like existing work to reuse (${hit.source_domain}).`;
  }
  if (age !== null && age >= 0 && age <= 7) {
    return `published_at ${hit.published_at} is within the last 7 days.`;
  }
  return `Same job as the claim, from ${hit.source}.`;
}

export function emptyPiles(): Piles {
  return {
    stand_on_this: [],
    already_in_the_lane: [],
    shipped_last_7_days: [],
  };
}

export function pileCounts(piles: Piles): Record<PileKey, number> {
  return {
    stand_on_this: piles.stand_on_this.length,
    already_in_the_lane: piles.already_in_the_lane.length,
    shipped_last_7_days: piles.shipped_last_7_days.length,
  };
}
