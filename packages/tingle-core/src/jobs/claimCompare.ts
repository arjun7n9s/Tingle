import { z } from "zod";
import type { LlmConfig } from "../llm.js";
import { completeJson } from "../llm.js";
import { isDistinctiveToken, tokens } from "../claim.js";
import type { PileableHit } from "../piles.js";

const CompareSchema = z.object({
  overlap_score: z.number().min(0).max(1),
  matched_concepts: z.array(z.string()).max(8).optional(),
  risk_level: z.enum(["low", "medium", "high"]).optional(),
});

const LLM_CAP = 10;

export function isPatentCard(hit: PileableHit): boolean {
  return (
    hit.source === "patent" ||
    Boolean(hit.office) ||
    /patent/i.test(`${hit.source_domain} ${hit.url}`)
  );
}

/** Distinctive-token Jaccard. Cheap gate before AIMLAPI. */
export function lexicalOverlap(claim: string, text: string): number {
  const distinctive = tokens(claim).filter(isDistinctiveToken);
  const a = new Set(distinctive.length ? distinctive : tokens(claim).filter((t) => t.length >= 4));
  const b = new Set(tokens(text).filter((t) => t.length >= 4));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  return hit / a.size;
}

/**
 * Rank patent cards against the claim. Lexical filter first, then at most
 * 10 AIMLAPI JSON compares. Never invents a URL or title.
 */
export async function scorePatentThreats(
  claim: string,
  hits: PileableHit[],
  opts?: { llm?: LlmConfig; minScore?: number },
): Promise<PileableHit[]> {
  const min = opts?.minScore ?? 0.6;
  const ranked = hits
    .map((h) => ({
      hit: h,
      lex: lexicalOverlap(claim, `${h.title} ${h.snippet}`),
    }))
    .sort((a, b) => b.lex - a.lex);

  const out: PileableHit[] = ranked.map(({ hit, lex }) => ({
    ...hit,
    overlap_score: lex,
  }));

  if (!opts?.llm) return out;

  const top = out.slice(0, LLM_CAP);
  for (const row of top) {
    if ((row.overlap_score ?? 0) < 0.15) continue;
    const parsed = await completeJson(
      opts.llm,
      [
        {
          role: "system",
          content:
            "Compare a builder's claim to one patent card. JSON only: {\"overlap_score\":0-1,\"matched_concepts\":string[],\"risk_level\":\"low\"|\"medium\"|\"high\"}. Use only the provided text. Do not invent patents.",
        },
        {
          role: "user",
          content: JSON.stringify({
            claim: claim.slice(0, 400),
            title: row.title.slice(0, 200),
            snippet: row.snippet.slice(0, 600),
            url: row.url,
          }),
        },
      ],
      { temperature: 0, timeoutMs: 12_000 },
    );
    const ok = CompareSchema.safeParse(parsed);
    if (!ok.success) continue;
    row.overlap_score = Math.max(row.overlap_score ?? 0, ok.data.overlap_score);
    if (ok.data.matched_concepts?.length) {
      row.snippet = `${row.snippet} Overlap: ${ok.data.matched_concepts.slice(0, 4).join(", ")}.`;
    }
    if (ok.data.risk_level === "high" && (row.overlap_score ?? 0) < min) {
      row.overlap_score = min;
    }
  }
  return out;
}
