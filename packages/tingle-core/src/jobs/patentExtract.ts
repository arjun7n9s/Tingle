import { z } from "zod";
import type { LlmConfig } from "../llm.js";
import { completeJson } from "../llm.js";

const ExtractSchema = z.object({
  title: z.string().max(300).optional(),
  applicants: z.array(z.string()).max(8).optional(),
  filing_date: z.string().max(40).optional(),
  abstract_excerpt: z.string().max(600).optional(),
  claims_excerpt: z.string().max(600).optional(),
});

/**
 * AIMLAPI extract from Unlocker markdown. Tight prompt, JSON only.
 * Does not invent a filing number or applicant that is not in the page.
 */
export async function extractPatentMarkdown(
  markdown: string,
  llm?: LlmConfig,
): Promise<string | undefined> {
  if (!llm) return undefined;
  const clipped = markdown.replace(/\s+/g, " ").trim().slice(0, 1200);
  if (clipped.length < 40) return undefined;
  const parsed = await completeJson(
    llm,
    [
      {
        role: "system",
        content:
          "Extract from one patent page. JSON only: {\"title\",\"applicants\":string[],\"filing_date\",\"abstract_excerpt\",\"claims_excerpt\"}. Copy only what is in the text. Do not invent a number, applicant, or claim.",
      },
      { role: "user", content: clipped },
    ],
    { temperature: 0, timeoutMs: 12_000 },
  );
  const ok = ExtractSchema.safeParse(parsed);
  if (!ok.success) return undefined;
  const bits = [
    ok.data.title,
    ok.data.applicants?.length ? `Applicants: ${ok.data.applicants.slice(0, 3).join(", ")}` : "",
    ok.data.filing_date ? `Filed: ${ok.data.filing_date}` : "",
    ok.data.abstract_excerpt,
    ok.data.claims_excerpt,
  ].filter((s) => s && s.trim());
  const out = bits.join(" ").replace(/\s+/g, " ").trim();
  return out.length >= 20 ? out.slice(0, 500) : undefined;
}
