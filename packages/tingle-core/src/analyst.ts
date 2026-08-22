import type { FirstLookResult } from "./jobs/firstLook.js";
import type { PileHit } from "./piles.js";

export const ANALYST_REFUSAL =
  "I don't have a tool for that. I only report what the scrapers returned for this project. I do not invent products, papers, or patents, and I do not score markets.";

function allHits(look?: FirstLookResult): PileHit[] {
  if (!look) return [];
  return [
    ...look.piles.stand_on_this,
    ...look.piles.already_in_the_lane,
    ...look.piles.shipped_last_7_days,
  ];
}

export function analystReply(
  message: string,
  look: FirstLookResult | undefined,
): { text: string; covered: boolean } {
  const q = message.toLowerCase();
  const market =
    /win the market|who will win|tam\b|total addressable|viability score|will (this|it) succeed/.test(
      q,
    );
  if (market) return { text: ANALYST_REFUSAL, covered: false };

  if (!look) {
    return {
      text: "No first look is on file yet. Confirm the claim and run first look.",
      covered: true,
    };
  }

  const hits = allHits(look);
  const searchHits = hits.filter((h) => h.collector === "search");

  if (/what did search return|search return|from search/.test(q)) {
    if (!look.sources_used.includes("search")) {
      return {
        text: "Search did not come back for this project. That is a collector failure, not an empty niche.",
        covered: true,
      };
    }
    if (!searchHits.length) {
      return {
        text: `Search returned, but none of the listing rows matched the claim after ranking. Scraped hits were dropped for precision. quality: scraped=${look.quality.hits_scraped} matched=${look.quality.hits_matched}.`,
        covered: true,
      };
    }
    const lines = searchHits
      .slice(0, 12)
      .map((h) => `- ${h.title} (${h.url})`)
      .join("\n");
    return {
      text: `Search returned ${searchHits.length} claim-matched row(s):\n${lines}`,
      covered: true,
    };
  }

  if (/github/.test(q)) {
    const gh = hits.filter((h) => /github\.com/i.test(h.url) || h.collector === "github_rest");
    if (!gh.length) {
      return {
        text: "No GitHub rows are in the first-look JSON. I will not invent a repo.",
        covered: true,
      };
    }
    return {
      text: gh.map((h) => `- ${h.title} (${h.url})`).join("\n"),
      covered: true,
    };
  }

  if (/mute|ignore/.test(q)) {
    return {
      text: "Use Mute on a hit to add it to ignore[]. I do not mute from a free-text guess.",
      covered: true,
    };
  }

  if (/source/.test(q)) {
    const used = look.sources_used.join(", ") || "none";
    const failed = look.collectors_failed.join("; ") || "none";
    return {
      text: `Sources used: ${used}. Collectors failed: ${failed}.`,
      covered: true,
    };
  }

  const summary = [
    look.analyst_contract,
    `Claim: ${look.claim}`,
    `Stand on this: ${look.piles.stand_on_this.length}. Already in the lane: ${look.piles.already_in_the_lane.length}. Shipped in the last 7 days: ${look.piles.shipped_last_7_days.length}.`,
    look.quality.hits_matched === 0
      ? `Collectors ran (${look.sources_used.join(", ") || "none"}); nothing matched the claim closely enough to show. Empty piles are not an empty niche invented by me.`
      : `Matched ${look.quality.hits_matched} of ${look.quality.hits_scraped} scraped rows.`,
  ].join("\n");
  return { text: summary, covered: true };
}
