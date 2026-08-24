import { adjunctSearchQueries, fetchPriorArt } from "../adjunct.js";
import { proposeClaim, isClaimRelevant, scoreAgainstClaim } from "../claim.js";
import { fallbackCompile, flattenGraphQueries } from "../claimGraph.js";
import type { TingleConfig } from "../config.js";
import { fetchMarketplaceAdjuncts } from "../marketplace.js";
import type { PileableHit } from "../piles.js";

export const PATENTABILITY_DISCLAIMER =
  "Not a legal opinion and not a patent grant. A patent office decides patentability. This memo only maps what this scrape returned for the confirmed claim.";

export type CoverageBand = "crowded" | "contested" | "thin" | "unseen_in_this_scrape";

export type PatentabilityHit = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  kind: "patent" | "paper" | "other";
};

export type PatentabilityAngle = {
  angle: string;
  coverage: CoverageBand;
  patent_count: number;
  paper_count: number;
  hits: PatentabilityHit[];
};

export type PatentabilityReport = {
  claim: string;
  at: string;
  disclaimer: string;
  verdict: "crowded" | "mixed" | "thin_in_this_scrape";
  verdict_line: string;
  memo: string;
  queries: string[];
  angles: PatentabilityAngle[];
  closest_art: PatentabilityHit[];
  sources_used: string[];
  collectors_failed: string[];
  marketplace_label?: string;
  mock: boolean;
};

function containsPhrase(hay: string, needle: string): boolean {
  const escaped = needle
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i").test(hay);
}

function kindOf(hit: PileableHit): PatentabilityHit["kind"] {
  const blob = `${hit.source} ${hit.source_domain} ${hit.url}`.toLowerCase();
  if (/uspto|patent/.test(blob)) return "patent";
  if (/arxiv|openalex|doi\.org/.test(blob)) return "paper";
  return "other";
}

function toHit(hit: PileableHit): PatentabilityHit {
  return {
    title: hit.title,
    url: hit.url,
    source: hit.source,
    snippet: hit.snippet.slice(0, 280),
    kind: kindOf(hit),
  };
}

function coverage(patentCount: number): CoverageBand {
  if (patentCount >= 5) return "crowded";
  if (patentCount >= 2) return "contested";
  if (patentCount === 1) return "thin";
  return "unseen_in_this_scrape";
}

function patentPrompts(claim: string, angles: string[]): string[] {
  return [
    `Prior art and patents for this invention. Cite patent numbers and URLs. Do not invent patents. Invention: ${claim}`,
    ...angles.slice(0, 3).map(
      (a) =>
        `Granted patents and published applications about ${a} related to: ${claim}. Cite USPTO or Google Patents URLs only. Do not invent patent numbers.`,
    ),
  ].slice(0, 4);
}

function writeMemo(report: Omit<PatentabilityReport, "memo">): string {
  const crowded = report.angles.filter((a) => a.coverage === "crowded");
  const thinner = report.angles.filter(
    (a) => a.coverage === "thin" || a.coverage === "unseen_in_this_scrape",
  );
  const contested = report.angles.filter((a) => a.coverage === "contested");
  const lines: string[] = [
    PATENTABILITY_DISCLAIMER,
    "",
    `Claim: ${report.claim}`,
    "",
    `Bottom line: ${report.verdict_line}`,
    "",
  ];
  if (crowded.length) {
    lines.push("Crowded orientations (many patents in this scrape):");
    for (const a of crowded) {
      lines.push(`- ${a.angle} — ${a.patent_count} patent records`);
    }
    lines.push("");
  }
  if (contested.length) {
    lines.push("Contested orientations (some patents, not empty):");
    for (const a of contested) {
      lines.push(`- ${a.angle} — ${a.patent_count} patent records`);
    }
    lines.push("");
  }
  if (thinner.length) {
    lines.push("Thinner or not seen in this scrape (not a green light):");
    for (const a of thinner) {
      lines.push(`- ${a.angle} — ${a.patent_count} patent records (${a.coverage.replaceAll("_", " ")})`);
    }
    lines.push("");
  }
  if (report.closest_art.length) {
    lines.push("Closest art this scrape kept:");
    for (const h of report.closest_art.slice(0, 8)) {
      lines.push(`- ${h.title} (${h.url})`);
    }
    lines.push("");
  } else {
    lines.push("No row survived ranking as closest art. Empty is honest — not “the niche is empty.”");
    lines.push("");
  }
  lines.push(
    "What a claim drafter usually does next: draft around the crowded independent-claim space, and put the thinner orientations (if any) into dependent or means-plus-function style claims. Confirm with a registered practitioner before filing.",
  );
  if (report.collectors_failed.length) {
    lines.push("");
    lines.push("Sources that did not come back:");
    for (const f of report.collectors_failed.slice(0, 8)) lines.push(`- ${f}`);
  }
  lines.push("");
  lines.push(`Sources used: ${report.sources_used.join(", ") || "none"}`);
  return lines.join("\n");
}

export async function runPatentability(
  input: { claim: string; fingerprints?: string[]; patentNumber?: string },
  deps: { config: TingleConfig },
): Promise<PatentabilityReport> {
  const proposed = proposeClaim({ claim: input.claim });
  const fingerprints = input.fingerprints?.length
    ? input.fingerprints
    : proposed.fingerprints;
  const claim = proposed.claim || input.claim;
  const graphQueries = flattenGraphQueries(fallbackCompile(claim), 5);
  const queries = [
    ...new Set([...graphQueries, ...adjunctSearchQueries(claim, fingerprints, 5)]),
  ]
    .filter((q) => q && !/^autonomous$/i.test(q))
    .slice(0, 5);
  const corpus = await fetchPriorArt(deps.config, {
    claim,
    fingerprints,
    patentNumber: input.patentNumber,
    queries,
  });
  const market = await fetchMarketplaceAdjuncts(deps.config, {
    fingerprints,
    deep: true,
    claim,
    prompts: patentPrompts(claim, queries),
    pollMs: 180_000,
    allowEmpty: true,
  });
  const rows = [...corpus.rows, ...market.rows];
  const sources_used = [...corpus.sources_used, ...market.sources_used];
  const collectors_failed = [
    ...corpus.collectors_failed,
    ...market.collectors_failed,
  ];

  const angles: PatentabilityAngle[] = queries.map((angle) => {
    const matched = rows.filter((h) =>
      containsPhrase(`${h.title} ${h.snippet} ${h.url}`, angle),
    );
    const patentHits = matched.filter((h) => kindOf(h) === "patent");
    const paperHits = matched.filter((h) => kindOf(h) === "paper");
    const ranked = [...patentHits, ...paperHits, ...matched.filter((h) => kindOf(h) === "other")];
    return {
      angle,
      coverage: coverage(patentHits.length),
      patent_count: patentHits.length,
      paper_count: paperHits.length,
      hits: ranked.slice(0, 8).map(toHit),
    };
  });

  const closest = rows
    .filter((h) => isClaimRelevant(h, fingerprints))
    .sort(
      (a, b) =>
        scoreAgainstClaim(`${b.title} ${b.snippet}`, fingerprints).score -
        scoreAgainstClaim(`${a.title} ${a.snippet}`, fingerprints).score,
    )
    .slice(0, 10)
    .map(toHit);

  const crowdedN = angles.filter((a) => a.coverage === "crowded").length;
  const thinN = angles.filter(
    (a) => a.coverage === "thin" || a.coverage === "unseen_in_this_scrape",
  ).length;
  const patentTotal = angles.reduce((n, a) => n + a.patent_count, 0);
  let verdict: PatentabilityReport["verdict"] = "mixed";
  let verdict_line =
    "Mixed coverage: some orientations are thick with patents, others were thin in this scrape.";
  if (patentTotal === 0) {
    verdict = "thin_in_this_scrape";
    verdict_line =
      "This scrape returned no patents that named these distinctive phrases. That is not a finding of novelty.";
  } else if (crowdedN >= 2 && thinN === 0) {
    verdict = "crowded";
    verdict_line =
      "The orientations we queried look crowded in the public record. Independent claims that only recite those phrases would likely sit on thick prior art.";
  } else if (crowdedN === 0 && thinN === angles.length) {
    verdict = "thin_in_this_scrape";
    verdict_line =
      "Each distinctive orientation was thin or unseen in this scrape. Still not a patent grant — it is a map of what we retrieved.";
  }

  const draft: Omit<PatentabilityReport, "memo"> = {
    claim,
    at: new Date().toISOString(),
    disclaimer: PATENTABILITY_DISCLAIMER,
    verdict,
    verdict_line,
    queries,
    angles,
    closest_art: closest,
    sources_used,
    collectors_failed,
    marketplace_label: market.sources_used.length ? market.label : undefined,
    mock: deps.config.mock,
  };
  return { ...draft, memo: writeMemo(draft) };
}
