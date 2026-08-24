import type { PileHit } from "../piles.js";
import type { Stage } from "../schema/profile.js";
import type { TingleEventType, Urgency } from "../schema/events.js";
import { isPatentCard } from "./claimCompare.js";

const URGENCY_RANK: Record<Urgency, number> = {
  now: 3,
  soon: 2,
  note: 1,
  quiet: 0,
};

export function maxUrgency(a: Urgency, b: Urgency): Urgency {
  return URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b;
}

function isPaper(hit: PileHit): boolean {
  return /arxiv|uspto|patent/i.test(`${hit.source_domain} ${hit.url} ${hit.source}`);
}

function isDiscussion(hit: PileHit): boolean {
  return /news\.ycombinator|reddit\.com|ycombinator/i.test(hit.source_domain);
}

function looksShipped(hit: PileHit): boolean {
  if (hit.source === "watch") return true;
  return hit.days_old !== null && hit.days_old >= 0 && hit.days_old <= 7;
}

function looksStandOn(hit: PileHit): boolean {
  return /github\.com|arxiv\.org|docs\./i.test(hit.source_domain) || hit.collector === "github";
}

export function classifyHit(
  hit: PileHit,
  stage: Stage,
): { type: TingleEventType; urgency: Urgency } {
  const type: TingleEventType = isPatentThreat(hit)
    ? "patent_threat"
    : isCrossBorder(hit)
      ? "cross_border"
      : isPaper(hit)
        ? "paper_patent"
        : isDiscussion(hit)
          ? "discussion"
          : looksShipped(hit)
            ? "just_shipped"
            : looksStandOn(hit)
              ? "already_exists"
              : "building";

  const urgency = urgencyFor(type, stage);
  return { type, urgency };
}

function isPatentThreat(hit: PileHit): boolean {
  return isPatentCard(hit) && typeof hit.overlap_score === "number" && hit.overlap_score >= 0.6;
}

function isCrossBorder(hit: PileHit): boolean {
  return hit.home === false && /^(yandex|baidu|naver)$/i.test(hit.region ?? "");
}

/**
 * Stage shifts what counts as Now.
 * Starting: someone shipped the sentence.
 * Building: a rival shipped the feature they are mid-build on.
 * Shipped: knockoff or a filing in the lane ("same verbs," never "you infringe").
 */
export function urgencyFor(type: TingleEventType, stage: Stage): Urgency {
  if (type === "ai_default" || type === "patent_threat" || type === "cross_border") {
    return "now";
  }
  if (stage === "starting") {
    if (type === "just_shipped") return "now";
    if (type === "paper_patent" || type === "building" || type === "discussion") return "soon";
    return "note";
  }
  if (stage === "building") {
    if (type === "just_shipped") return "now";
    if (type === "building" || type === "paper_patent" || type === "discussion") return "soon";
    return "note";
  }
  if (type === "just_shipped" || type === "paper_patent") return "now";
  if (type === "building" || type === "discussion") return "soon";
  return "note";
}

export function clusterKey(hit: PileHit): string {
  return hit.entity_key;
}
