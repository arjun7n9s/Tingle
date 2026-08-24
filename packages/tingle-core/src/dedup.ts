import type { PileHit, PileableHit } from "./piles.js";
import { entityKey } from "./piles.js";

export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function registrableDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    return parts.slice(-2).join(".");
  } catch {
    return url;
  }
}

function hashPrefix(hash: string): string {
  return hash.slice(0, 16);
}

function fingerprintOverlap(
  a: PileableHit,
  b: PileableHit,
  fingerprints: string[],
): boolean {
  const hayA = `${a.title} ${a.snippet}`.toLowerCase();
  const hayB = `${b.title} ${b.snippet}`.toLowerCase();
  const shared = fingerprints.filter(
    (fp) => fp.length >= 4 && hayA.includes(fp) && hayB.includes(fp),
  );
  return shared.length >= 1;
}

/**
 * Same product on Search + Watch + HN is one entity, not three threats.
 * Title match across hosts wins; same-site title/domain is next; content-hash
 * prefix plus fingerprint overlap catches a page that moved URL.
 */
export function sameEntity(
  a: PileHit,
  b: PileHit,
  fingerprints: string[] = [],
): boolean {
  const ta = titleKey(a.title);
  const tb = titleKey(b.title);
  if (ta && ta === tb) return true;
  if (a.entity_key && a.entity_key === b.entity_key) return true;
  if (
    registrableDomain(a.url) === registrableDomain(b.url) &&
    ta &&
    tb &&
    (ta.includes(tb) || tb.includes(ta))
  ) {
    return true;
  }
  if (
    hashPrefix(a.content_hash) === hashPrefix(b.content_hash) &&
    fingerprintOverlap(a, b, fingerprints)
  ) {
    return true;
  }
  return false;
}

export function clusterHits(hits: PileHit[], fingerprints: string[] = []): PileHit[][] {
  const groups: PileHit[][] = [];
  for (const hit of hits) {
    const existing = groups.find((g) => g.some((h) => sameEntity(h, hit, fingerprints)));
    if (existing) existing.push(hit);
    else groups.push([hit]);
  }
  return groups;
}

export function clusterEntityKey(group: PileHit[]): string {
  const titles = new Set(group.map((h) => titleKey(h.title)).filter(Boolean));
  if (titles.size === 1) return [...titles][0]!;
  return group[0]?.entity_key ?? entityKey(group[0]!);
}

/** Tokens written to ignore[] so a muted cluster cannot reopen as three events. */
export function muteTokens(hit: {
  url?: string;
  title?: string;
  entity_key?: string;
}): string[] {
  const out: string[] = [];
  if (hit.url) out.push(hit.url);
  if (hit.entity_key) out.push(hit.entity_key);
  if (hit.title) {
    const t = titleKey(hit.title);
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

export function isMuted(
  hit: Pick<PileableHit, "title" | "url"> & { entity_key?: string },
  ignore: string[],
): boolean {
  if (!ignore.length) return false;
  const keys = new Set(ignore.map((g) => g.toLowerCase()));
  const t = titleKey(hit.title);
  if (t && keys.has(t)) return true;
  if (hit.url && keys.has(hit.url.toLowerCase())) return true;
  if (hit.entity_key && keys.has(hit.entity_key.toLowerCase())) return true;
  const blob = `${hit.title} ${hit.url} ${hit.entity_key ?? ""}`.toLowerCase();
  return ignore.some((g) => {
    const needle = g.trim().toLowerCase();
    return needle.length >= 3 && blob.includes(needle);
  });
}

export const CLAIM_LOCK_WARNING =
  "The claim is locked. Changing it rebuilds fingerprints and the baseline and spends credits. Send rebuild: true with confirmed: true to proceed.";
