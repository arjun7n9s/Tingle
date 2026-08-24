import { z } from "zod";
import {
  conceptHits,
  isAmbientToken,
  isDistinctiveToken,
  isGenericTech,
} from "./claim.js";
import type { ClaimGraph } from "./claimGraph.js";
import type { LlmConfig } from "./llm.js";
import { completeJson } from "./llm.js";
import type { PileableHit } from "./piles.js";

export const RELEVANCE_LABELS = [
  "same_invention",
  "related_art",
  "setting_only",
  "unrelated",
] as const;
export type RelevanceLabel = (typeof RELEVANCE_LABELS)[number];

export const JudgementSchema = z.object({
  labels: z
    .array(
      z.object({
        i: z.number().int().nonnegative(),
        label: z.enum(RELEVANCE_LABELS),
      }),
    )
    .max(20),
});

export type JudgedHit = PileableHit & {
  relevance: RelevanceLabel;
};

const KEEP = new Set<RelevanceLabel>(["same_invention", "related_art"]);

export function keepsPile(label: RelevanceLabel): boolean {
  return KEEP.has(label);
}

export function lexicalJudge(
  hit: Pick<PileableHit, "title" | "snippet" | "url">,
  graph: ClaimGraph,
): RelevanceLabel {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`;
  const mustHits = graph.must_concepts.filter((c) => c && conceptHits(blob, c));
  const settingHits = graph.setting_terms.filter((c) => c && conceptHits(blob, c));
  if (!mustHits.length) {
    return settingHits.length ? "setting_only" : "unrelated";
  }
  const onlySetting =
    mustHits.every((m) => m.split(/\s+/).every(isAmbientToken)) ||
    (settingHits.length > 0 &&
      mustHits.every((m) => graph.setting_terms.includes(m)));
  if (onlySetting) return "setting_only";

  const distinctive = mustHits.filter((m) =>
    m.split(/\s+/).some(isDistinctiveToken),
  );
  const generic = mustHits.filter((m) => m.split(/\s+/).some(isGenericTech));
  const graphHasDistinctive = graph.must_concepts.some((m) =>
    m.split(/\s+/).some(isDistinctiveToken),
  );
  if (graphHasDistinctive && !distinctive.length && !mustHits.some((m) => m.includes(" "))) {
    return "unrelated";
  }
  if (mustHits.some((m) => m.includes(" ")) || distinctive.length) {
    return distinctive.length >= 2 || mustHits.some((m) => m.includes(" "))
      ? "same_invention"
      : "related_art";
  }
  if (generic.length) return "related_art";
  return "unrelated";
}

const JUDGE_SYSTEM = [
  "You label search hits against a structured claim graph.",
  "Return JSON only: { \"labels\": [{ \"i\": number, \"label\": \"same_invention\" | \"related_art\" | \"setting_only\" | \"unrelated\" }] }",
  "same_invention: same object doing the same job, even if branding differs.",
  "related_art: shared mechanism or object, not the full claim.",
  "setting_only: overlaps scene/quality words (dangerous, environment, efficient) but not the invention.",
  "unrelated: different invention.",
  "Do not invent titles. Use only the rows given. Index i matches the input list.",
].join(" ");

export async function judgeHits(
  hits: PileableHit[],
  graph: ClaimGraph,
  llm?: LlmConfig,
  limit = 15,
): Promise<JudgedHit[]> {
  const batch = hits.slice(0, Math.max(1, limit));
  const rest = hits.slice(batch.length);
  const lexical = (h: PileableHit): JudgedHit => ({
    ...h,
    relevance: lexicalJudge(h, graph),
  });

  let llmMap: Map<number, RelevanceLabel> | undefined;
  if (llm && batch.length) {
    const raw = await completeJson(
      llm,
      [
        { role: "system", content: JUDGE_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            claim_graph: {
              object: graph.object,
              function: graph.function,
              mechanism: graph.mechanism,
              setting: graph.setting,
              must_concepts: graph.must_concepts,
              setting_terms: graph.setting_terms,
            },
            hits: batch.map((h, i) => ({
              i,
              title: h.title.slice(0, 180),
              snippet: h.snippet.slice(0, 240),
              url: h.url,
            })),
          }),
        },
      ],
      { temperature: 0, timeoutMs: 20_000 },
    );
    const parsed = JudgementSchema.safeParse(raw);
    if (parsed.success) {
      llmMap = new Map(
        parsed.data.labels
          .filter((l) => l.i < batch.length)
          .map((l) => [l.i, l.label]),
      );
    }
  }

  const judgedBatch = batch.map((h, i) => {
    const fromLlm = llmMap?.get(i);
    return fromLlm
      ? { ...h, relevance: fromLlm }
      : lexical(h);
  });
  return [...judgedBatch, ...rest.map(lexical)];
}

export function judgedForPiles(rows: JudgedHit[]): JudgedHit[] {
  return rows.filter((h) => keepsPile(h.relevance));
}
