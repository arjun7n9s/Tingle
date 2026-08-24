import { createHash } from "node:crypto";
import { isClaimRelevant, isContentFingerprint, scoreAgainstClaim } from "./claim.js";

export type PileableHit = {
  source: string;
  title: string;
  url: string;
  snippet: string;
  published_at: string | null;
  source_domain: string;
  collector?: string;
  region?: string;
  office?: string;
  /** False = foreign board / office (fast tracker). */
  home?: boolean;
  /** Lexical/LLM overlap vs the confirmed claim. Adjunct scoring only. */
  overlap_score?: number;
};

export const PILE_KEYS = [
  "stand_on_this",
  "local_lane",
  "already_in_the_lane",
  "fast_tracker",
  "shipped_last_7_days",
  "patent_landscape",
  "patent_threats",
  "prior_art_papers",
  "regional_discovered",
] as const;
export type PileKey = (typeof PILE_KEYS)[number];

export type PileHit = PileableHit & {
  id: string;
  why: string;
  collector: string;
  content_hash: string;
  entity_key: string;
  days_old: number | null;
  relevance?: "same_invention" | "related_art";
};

export type Piles = Record<PileKey, PileHit[]>;

/** Labels the judge may stamp. Piles keep only the first two. */
export type PileRelevance =
  | "same_invention"
  | "related_art"
  | "setting_only"
  | "unrelated";

export type PileInput = {
  fingerprints: string[];
  must_match?: string[];
  ignore?: string[];
  now?: Date;
  /** When set, piles skip lexical isClaimRelevant and keep judged keepers only. */
  judged?: Record<string, PileRelevance>;
  /** Patent rows at or above this overlap go on patent_threats. Default 0.6. */
  overlap_min?: number;
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
  "openalex.org",
  "doi.org",
  "crossref.org",
]);

const PATENT_HOSTS = new Set([
  "patents.google.com",
  "patentscope.wipo.int",
  "worldwide.espacenet.com",
  "uspto.gov",
  "ppubs.uspto.gov",
  "epo.org",
  "j-platpat.inpit.go.jp",
  "kipris.or.kr",
  "cnipa.gov.cn",
  "ip2.sg",
  "lens.org",
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

function hostOf(hit: PileableHit): string {
  return hit.source_domain.replace(/^www\./, "");
}

function isPatentHit(hit: PileableHit): boolean {
  if (hit.source === "patent" || hit.office) return true;
  return PATENT_HOSTS.has(hostOf(hit));
}

function isStandOn(hit: PileableHit): boolean {
  if (isPatentHit(hit)) return false;
  if (STAND_HOSTS.has(hostOf(hit))) return true;
  if (hit.source === "search" && /github\.com/i.test(hit.url)) return true;
  return STAND_TITLE.test(`${hit.title} ${hit.snippet}`);
}

function isForeign(hit: PileableHit): boolean {
  return hit.home === false;
}

function isPaperHit(hit: PileableHit): boolean {
  if (isPatentHit(hit)) return false;
  return /arxiv|openalex|doi\.org|crossref/i.test(
    `${hit.source} ${hit.source_domain} ${hit.url}`,
  );
}

function isRegionalEngine(region: string | undefined): boolean {
  return /^(yandex|baidu|naver)$/i.test(region ?? "");
}

export function mergeHits(
  into: PileableHit[],
  extra: PileableHit[],
): PileableHit[] {
  const seen = new Set(into.map((h) => h.url));
  for (const hit of extra) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    into.push(hit);
  }
  return into;
}

export function allPileHits(piles: Piles): PileHit[] {
  return PILE_KEYS.flatMap((k) => piles[k]);
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
  const piles: Piles = emptyPiles();
  const overlapMin = input.overlap_min ?? 0.6;

  const KEEP = new Set<PileRelevance>(["same_invention", "related_art"]);

  for (const hit of hits) {
    const judgedLabel = input.judged?.[hit.url];
    if (input.judged) {
      if (!judgedLabel || !KEEP.has(judgedLabel)) continue;
    } else if (
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
    const keepLabel =
      judgedLabel === "same_invention" || judgedLabel === "related_art"
        ? judgedLabel
        : undefined;
    const piled: PileHit = {
      ...hit,
      id: hitId(hit.url),
      why: why(hit, age, input.fingerprints, keepLabel),
      collector: hit.source,
      content_hash: contentHash(hit),
      entity_key: entityKey(hit),
      days_old: age,
      relevance: keepLabel,
    };

    if (isPatentHit(hit)) {
      piles.patent_landscape.push(piled);
      if ((hit.overlap_score ?? 0) >= overlapMin) {
        piles.patent_threats.push(piled);
      }
    } else if (isPaperHit(hit)) {
      piles.prior_art_papers.push(piled);
      if (!(age !== null && age >= 0 && age <= 7)) {
        piles.stand_on_this.push(piled);
      }
    } else if (isStandOn(hit) && !(age !== null && age >= 0 && age <= 7)) {
      piles.stand_on_this.push(piled);
    } else if (isForeign(hit)) {
      piles.fast_tracker.push(piled);
      if (isRegionalEngine(hit.region)) {
        piles.regional_discovered.push(piled);
      }
    } else if (age !== null && age >= 0 && age <= 7) {
      piles.shipped_last_7_days.push(piled);
    } else {
      piles.local_lane.push(piled);
      piles.already_in_the_lane.push(piled);
    }
  }

  piles.patent_threats.sort(
    (a, b) => (b.overlap_score ?? 0) - (a.overlap_score ?? 0),
  );
  return piles;
}

function why(
  hit: PileableHit,
  age: number | null,
  fingerprints: string[],
  label?: "same_invention" | "related_art",
): string {
  const { matched } = scoreAgainstClaim(
    `${hit.title} ${hit.snippet} ${hit.url}`,
    fingerprints,
  );
  const overlap = matched.filter(isContentFingerprint).slice(0, 4);
  const judged = label
    ? ` Judged ${label.replaceAll("_", " ")}.`
    : "";
  const bits = overlap.length ? ` Overlap: ${overlap.join(", ")}.` : "";
  if (isPatentHit(hit)) {
    return `Patent-office row (${hit.office ?? hit.source_domain}).${judged}${bits}`;
  }
  if (isStandOn(hit)) {
    return `Looks like existing work to reuse (${hit.source_domain}).${judged}${bits}`;
  }
  if (isForeign(hit)) {
    return `Shipping in another region (${hit.region ?? hit.source_domain}).${judged}${bits}`;
  }
  if (age !== null && age >= 0 && age <= 7) {
    return `published_at ${hit.published_at} is within the last 7 days.${judged}${bits}`;
  }
  return `Public row that passed claim matching, from ${hit.source}.${judged}${bits}`;
}

export function emptyPiles(): Piles {
  return {
    stand_on_this: [],
    local_lane: [],
    already_in_the_lane: [],
    fast_tracker: [],
    shipped_last_7_days: [],
    patent_landscape: [],
    patent_threats: [],
    prior_art_papers: [],
    regional_discovered: [],
  };
}

export function pileCounts(piles: Piles): Record<PileKey, number> {
  return {
    stand_on_this: piles.stand_on_this.length,
    local_lane: piles.local_lane.length,
    already_in_the_lane: piles.already_in_the_lane.length,
    fast_tracker: piles.fast_tracker.length,
    shipped_last_7_days: piles.shipped_last_7_days.length,
    patent_landscape: piles.patent_landscape.length,
    patent_threats: piles.patent_threats.length,
    prior_art_papers: piles.prior_art_papers.length,
    regional_discovered: piles.regional_discovered.length,
  };
}
