import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HitSource } from "./schema/hits.js";
import { normalizeRow } from "./schema/hits.js";
import type { LlmConfig } from "./llm.js";
import { completeJson } from "./llm.js";

/**
 * The only AIMLAPI call site that earns its keep: messy extractor output,
 * before Zod. The analyst does not call this. Empty title+snippet does not.
 */

const CJK =
  /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff]/;

const CLAIM_BLOB =
  /\b(comprising|wherein|权利要求|請求項|характеризующ)\b/i;

export type NormalizeAudit = {
  audit_id: string;
  collector: string;
  used_llm: boolean;
  chars_in: number;
  chars_out: number;
};

export type NormalizeResult = {
  row: unknown;
  audit?: NormalizeAudit;
};

const OutSchema = z.object({
  title: z.string().min(1).max(300),
  snippet: z.string().min(1).max(400),
});

export function needsLlmNormalize(title: string, snippet: string): boolean {
  if (!title.trim() && !snippet.trim()) return false;
  if (CJK.test(title) || CJK.test(snippet)) return true;
  if (snippet.length > 400) return true;
  if (CLAIM_BLOB.test(snippet)) return true;
  return false;
}

const SYSTEM = [
  "You clean one scraped card into English for a schema gate.",
  "Return JSON only: { \"title\": string, \"snippet\": string }",
  "title: English, one line, the invention or product name. Do not invent a name from nothing.",
  "snippet: ONE English sentence stating the problem it solves. Compress abstracts/claims. Do not add companies, URLs, or features that are not in the input.",
  "If the input is already short English, copy it.",
].join(" ");

export async function normalizeExtractorRow(
  family: HitSource,
  raw: unknown,
  opts: { llm?: LlmConfig; collector: string },
): Promise<NormalizeResult> {
  const aliased = normalizeRow(family, raw) as Record<string, unknown>;
  const title = String(aliased.title ?? "");
  const snippet = String(aliased.snippet ?? "");
  if (!needsLlmNormalize(title, snippet) || !opts.llm) {
    return { row: aliased };
  }

  const audit_id = randomUUID();
  const chars_in = title.length + snippet.length;
  const parsed = await completeJson(
    opts.llm,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          audit_id,
          collector: opts.collector,
          title,
          snippet: snippet.slice(0, 1200),
        }),
      },
    ],
    { temperature: 0, timeoutMs: 12_000 },
  );
  const out = OutSchema.safeParse(parsed);
  if (!out.success) {
    return {
      row: aliased,
      audit: {
        audit_id,
        collector: opts.collector,
        used_llm: false,
        chars_in,
        chars_out: chars_in,
      },
    };
  }
  const next = {
    ...aliased,
    title: title.trim() ? out.data.title : title,
    snippet: out.data.snippet,
  };
  if (!title.trim()) {
    // Never invent a title the extractor did not produce.
    next.title = title;
  }
  return {
    row: next,
    audit: {
      audit_id,
      collector: opts.collector,
      used_llm: true,
      chars_in,
      chars_out: String(next.title).length + String(next.snippet).length,
    },
  };
}

export async function normalizeExtractorRows(
  family: HitSource,
  rows: unknown[],
  opts: { llm?: LlmConfig; collector: string },
): Promise<{ rows: unknown[]; audits: NormalizeAudit[] }> {
  const out: unknown[] = [];
  const audits: NormalizeAudit[] = [];
  for (const row of rows) {
    const n = await normalizeExtractorRow(family, row, opts);
    out.push(n.row);
    if (n.audit) audits.push(n.audit);
  }
  return { rows: out, audits };
}
