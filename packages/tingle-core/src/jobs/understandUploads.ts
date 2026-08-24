import type { LlmConfig } from "../llm.js";
import { completeJson, type ChatMessage } from "../llm.js";
import type { IncomingAttachment } from "../attachments.js";

/**
 * Turn uploads into claim-usable text. Text files are already inlined.
 * Photos go through AIMLAPI vision when a data URL is present. PDFs without
 * extractable text stay a labeled stub — we do not invent an abstract.
 */
export async function understandUploads(
  attachments: IncomingAttachment[],
  llm?: LlmConfig,
): Promise<string> {
  const bits: string[] = [];
  for (const a of attachments) {
    if (a.kind === "image" && a.image_data && llm) {
      const described = await describePhoto(a, llm);
      if (described) bits.push(`From photo ${a.name}:\n${described}`);
      else bits.push(`Attached photo: ${a.name} (vision returned nothing — add a caption).`);
      continue;
    }
    if (a.text?.trim()) continue;
    if (a.kind === "image") {
      bits.push(`Attached photo: ${a.name}. No caption and no vision text.`);
    }
  }
  return bits.join("\n\n").slice(0, 8_000);
}

async function describePhoto(
  a: IncomingAttachment,
  llm: LlmConfig,
): Promise<string | undefined> {
  const data = a.image_data ?? "";
  if (!/^data:image\//i.test(data) || data.length > 700_000) return undefined;
  const parsed = await completeJson(
    llm,
    [
      {
        role: "system",
        content:
          "Describe the attached product photo in 2-4 factual sentences for a prior-art search. Name visible parts and any readable text. Do not invent a brand, market, or patent. JSON: {\"description\": string}",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Photo filename: ${a.name}` },
          { type: "image_url", image_url: { url: data } },
        ],
      },
    ] as ChatMessage[],
    { temperature: 0, timeoutMs: 25_000 },
  );
  const rec = parsed && typeof parsed === "object" ? (parsed as { description?: unknown }) : {};
  return typeof rec.description === "string" ? rec.description.trim().slice(0, 800) : undefined;
}
