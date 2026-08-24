import type { FirstLookResult } from "./jobs/firstLook.js";
import type { PileHit } from "./piles.js";
import { narrateLook, type LlmConfig } from "./llm.js";

const MARKETPLACE_NOTE =
  "These rows are Dataset Marketplace adjuncts — not Scraper Studio, not in the first-look quality bar.";

export const ANALYST_REFUSAL =
  "I don't score markets or pick winners. I only report what came back for this claim. I won't invent products, papers, or patents.";

export const TINGLE_VOICE =
  "This is Tingle — a claim watch for builders. You lock one sentence. We scrape public pages into piles: existing work, local lane, fast-trackers in other regions, new this week, and patent landscape. Turn watching on and I ping you when something new matches.";

const ANALYST_NAME =
  "I'm Tingle — the analyst on this file. I read the first look and answer from those pages.";

const ANALYST_JOB =
  "I'm Tingle's analyst on this file. I walk the look: existing work, local lane, fast-trackers, new this week, patent landscape, and anything that didn't match. Ask about a pile, a source, or a title that came back. I don't invent competitors or score the market.";

function foldAsk(message: string): string {
  return message.toLowerCase().replace(/[\u2018\u2019]/g, "'");
}

function viaAiml(llm?: LlmConfig): boolean {
  return Boolean(llm?.url && /aimlapi/i.test(llm.url));
}

function modelReply(llm?: LlmConfig): string {
  if (!llm) {
    return "I'm Tingle's analyst, not ChatGPT. No chat model is configured on this API, so I answer from the look JSON.";
  }
  const via = viaAiml(llm) ? " via AIML API" : "";
  return `I'm Tingle's analyst, not ChatGPT. Chat on this file is narrated by ${llm.model}${via}. The piles still come from the scrape — I won't invent a competitor the look didn't return.`;
}

function houseReply(
  message: string,
  llm?: LlmConfig,
): { text: string; covered: boolean; kind: "house" } | undefined {
  const q = foldAsk(message);
  const model =
    /which (ai |llm )?model|what (ai |llm )?model|what (ai|llm) are you|which (ai|llm)\b|are you (chatgpt|gpt|claude|gemini|an ai|a bot|an llm)|powered by (gpt|openai|claude|gemini|an? (ai|llm))|what (engine|stack) (are you|is (this|that))|behind the (chat|analyst)|gpt-?\d/.test(
      q,
    );
  if (model) {
    return { text: modelReply(llm), covered: true, kind: "house" };
  }
  const who =
    /who are you|what are you|what(?:'s| is) your name|your name\??$|what do (i|we) call you/.test(
      q,
    );
  if (who) {
    return { text: ANALYST_NAME, covered: true, kind: "house" };
  }
  const about =
    /what is tingle|explain tingle|name of (this|the) (site|tool|app|product)|what(?:'s| is) (this|the) (site|tool|app|product)|tell me about (this |the )?(site|tool|app|product|tingle)|how (do|does) (this|tingle|the (site|tool|app)) work|what does (tingle|this (site|tool|app|product)) do/.test(
      q,
    );
  if (about) {
    return { text: TINGLE_VOICE, covered: true, kind: "house" };
  }
  const job = /what can you do|how (can|do) you help|what do you do\??$/.test(q);
  if (job) {
    return { text: ANALYST_JOB, covered: true, kind: "house" };
  }
  return undefined;
}

function allHits(look?: FirstLookResult): PileHit[] {
  if (!look) return [];
  return [
    ...look.piles.stand_on_this,
    ...(look.piles.local_lane ?? []),
    ...(look.piles.already_in_the_lane ?? []),
    ...(look.piles.fast_tracker ?? []),
    ...look.piles.shipped_last_7_days,
    ...(look.piles.patent_landscape ?? []),
  ];
}

export function analystReply(
  message: string,
  look: FirstLookResult | undefined,
  opts?: { llm?: LlmConfig },
): { text: string; covered: boolean; kind: "house" | "look" } {
  const house = houseReply(message, opts?.llm);
  if (house) return house;

  const q = message.toLowerCase();
  const market =
    /win the market|who will win|tam\b|total addressable|viability score|will (this|it) succeed/.test(
      q,
    );
  if (market) return { text: ANALYST_REFUSAL, covered: false, kind: "house" };

  if (!look) {
    return {
      text: "No first look is on file yet. Confirm the claim and run first look.",
      covered: true,
      kind: "look",
    };
  }

  const hits = allHits(look);
  const searchHits = hits.filter((h) => h.collector === "search");

  if (/what did search return|search return|from search/.test(q)) {
    if (!look.sources_used.includes("search")) {
      return {
        text: "Search did not come back for this project. That is a collector failure, not an empty niche.",
        covered: true,
        kind: "look",
      };
    }
    if (!searchHits.length) {
      return {
        text: [
          `Search is the listing at ${look.quality.search_listing_url}, ranked against your claim — not a Google search.`,
          `It returned, but none of those posts matched “${look.claim}”. scraped=${look.quality.hits_scraped} matched=${look.quality.hits_matched}.`,
          droppedLine(look),
        ]
          .filter(Boolean)
          .join(" "),
        covered: true,
        kind: "look",
      };
    }
    const lines = searchHits
      .slice(0, 12)
      .map((h) => `- ${h.title} (${h.url})`)
      .join("\n");
    return {
      text: `Search returned ${searchHits.length} claim-matched row(s):\n${lines}`,
      covered: true,
      kind: "look",
    };
  }

  if (
    /chatgpt dataset|ai mode dataset|dataset marketplace|firehose|deep lookup|what did (chatgpt|ai mode) return/.test(
      q,
    )
  ) {
    const adjunct = hits.filter((h) =>
      /chatgpt_dataset|ai_mode_dataset|firehose|deep_lookup/.test(h.collector),
    );
    const labeled = look.quality.marketplace_label;
    if (!adjunct.length) {
      return {
        text: labeled
          ? `${labeled} No rows came back from those adjuncts. I will not invent a citation.`
          : "No ChatGPT / AI Mode / Firehose rows are in this first look. Those are Dataset Marketplace adjuncts, not Scraper Studio, and they are off unless the budget lane is deep. I will not invent a citation.",
        covered: true,
        kind: "look",
      };
    }
    return {
      text: [
        MARKETPLACE_NOTE,
        ...adjunct.map((h) => `- ${h.title} (${h.url}) [${h.collector}]`),
      ].join("\n"),
      covered: true,
      kind: "look",
    };
  }

  if (/github/.test(q)) {
    const gh = hits.filter((h) => /github\.com/i.test(h.url) || h.collector === "github_rest");
    if (!gh.length) {
      return {
        text: "No GitHub rows are in the first-look JSON. I will not invent a repo.",
        covered: true,
        kind: "look",
      };
    }
    return {
      text: gh.map((h) => `- ${h.title} (${h.url})`).join("\n"),
      covered: true,
      kind: "look",
    };
  }

  if (/mute|ignore/.test(q)) {
    return {
      text: "Use Mute on a hit to add it to ignore[]. I do not mute from a free-text guess.",
      covered: true,
      kind: "look",
    };
  }

  if (/source/.test(q)) {
    const used = look.sources_used.join(", ") || "none";
    const failed = look.collectors_failed.join("; ") || "none";
    return {
      text: `Sources used: ${used}. Collectors failed: ${failed}.`,
      covered: true,
      kind: "look",
    };
  }

  return { text: lookSummary(look), covered: true, kind: "look" };
}

export async function answerAnalyst(
  message: string,
  look: FirstLookResult | undefined,
  opts?: {
    llm?: LlmConfig;
    history?: { role: "user" | "analyst"; text: string }[];
  },
): Promise<{ text: string; covered: boolean; narrated: boolean; kind: "house" | "look" }> {
  const assembled = analystReply(message, look, { llm: opts?.llm });
  if (houseReply(message, opts?.llm) || !assembled.covered || !look || !opts?.llm) {
    return { ...assembled, narrated: false };
  }
  const narrated = await narrateLook({
    llm: opts.llm,
    question: message,
    look,
    history: opts.history,
    refusal: ANALYST_REFUSAL,
  });
  if (!narrated) return { ...assembled, narrated: false };
  return { text: narrated, covered: true, narrated: true, kind: "look" };
}

function droppedLine(look: FirstLookResult): string {
  const sample = look.quality.dropped_sample ?? [];
  const n = look.quality.dropped_count ?? sample.length;
  if (!n) return "";
  const listed = sample.length ? ` Sample: ${sample.join("; ")}.` : "";
  return `Ranked out ${n} row(s) as unrelated.${listed}`;
}

function lookSummary(look: FirstLookResult): string {
  const listing =
    look.quality.search_listing_url || "https://dev.to/t/indiehackers";
  const usedSearch = look.quality.collectors_returned.includes("search");
  const usedApis = look.sources_used.filter((s) =>
    ["hn", "arxiv", "uspto", "github_rest"].includes(s),
  );
  const lines = [`Claim: ${look.claim}.`];
  if (usedSearch) {
    lines.push(
      `Search ranked the public listing at ${listing} against that sentence. That listing is not Google and not ChatGPT.`,
    );
  }
  if (usedApis.length) {
    lines.push(
      `Public JSON APIs queried for this claim: ${usedApis.join(", ")}. I only keep rows that match the claim.`,
    );
  }
  if (!usedSearch && !usedApis.length) {
    lines.push(
      "No Search listing and no JSON APIs came back this turn. I will not invent competitors.",
    );
  }
  if (look.quality.mock) {
    lines.push(
      "This run used fixtures (mock), which is why it was instant. Restart the Tingle API without TINGLE_MOCK=1 to query the live web.",
    );
  }
  if (look.quality.hits_matched === 0) {
    lines.push(
      `Looked at ${look.quality.hits_scraped} row(s); none matched the claim closely enough to show. ${droppedLine(look)} I will not invent competitors from memory.`,
    );
  } else {
    lines.push(
      `Matched ${look.quality.hits_matched} of ${look.quality.hits_scraped} scraped rows.`,
    );
    const titles = allHits(look)
      .slice(0, 8)
      .map((h) => `- ${h.title} (${h.url})`)
      .join("\n");
    if (titles) lines.push(titles);
  }
  return lines.filter((l) => l.trim()).join("\n\n");
}
