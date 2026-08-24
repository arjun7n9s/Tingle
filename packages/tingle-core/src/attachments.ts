export type IncomingAttachment = {
  name: string;
  kind: "image" | "text" | "file";
  text?: string;
  /** Compressed data URL for photos. Vision only — never stored as a scrape. */
  image_data?: string;
};

export function parseIncomingAttachments(raw: unknown): IncomingAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomingAttachment[] = [];
  for (const row of raw.slice(0, 12)) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 180) : "";
    if (!name) continue;
    const kind =
      rec.kind === "image" || rec.kind === "text" || rec.kind === "file"
        ? rec.kind
        : "file";
    const text =
      typeof rec.text === "string" ? rec.text.replace(/\u0000/g, "").slice(0, 40_000) : "";
    const image_data =
      typeof rec.image_data === "string" && /^data:image\//i.test(rec.image_data)
        ? rec.image_data.slice(0, 700_000)
        : undefined;
    out.push({ name, kind, text: text || undefined, image_data });
  }
  return out;
}

export function foldAttachmentText(
  docs: string | undefined,
  attachments: IncomingAttachment[],
): string {
  const bits: string[] = [];
  const d = docs?.trim();
  if (d) bits.push(d);
  for (const a of attachments) {
    const body = a.text?.trim();
    if (body) {
      bits.push(`From ${a.name}:\n${body}`);
      continue;
    }
    if (a.kind === "image") bits.push(`Attached photo: ${a.name}`);
    else bits.push(`Attached file: ${a.name}`);
  }
  return bits.join("\n\n").slice(0, 80_000);
}

/**
 * Pull printable strings from a PDF buffer. Works for uncompressed text PDFs.
 * Scanned/image PDFs return "" — callers must keep an honest stub, not invent
 * an abstract.
 */
export function extractPdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  if (!raw.startsWith("%PDF")) return "";
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)]){3,}\)/g;
  for (const m of raw.matchAll(re)) {
    const s = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z]{3,}/.test(s)) chunks.push(s);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 40_000);
}
