import { z } from "zod";

export const HitSourceSchema = z.enum(["search", "watch", "chaos"]);
export type HitSource = z.infer<typeof HitSourceSchema>;

/**
 * The one row shape every Tingle collector returns. Field names are frozen —
 * heal prompts name them explicitly, so renaming one silently breaks repair.
 *
 * `title`, `url` and `snippet` are required and non-empty on purpose. An empty
 * required field means the extractor died, not that the niche is empty, so it
 * has to fail validation loudly enough to start a heal.
 */
export const HitRowSchema = z.object({
  source: HitSourceSchema,
  title: z.string().min(1, "empty title — extractor likely broken"),
  url: z.string().url("missing or malformed url — extractor likely broken"),
  snippet: z.string().min(1, "empty snippet — extractor likely broken"),
  published_at: z.string().nullable().default(null),
  source_domain: z.string().min(1, "could not derive source_domain from url"),
});

export type HitRow = z.infer<typeof HitRowSchema>;

const ALIASES = {
  title: ["title", "name", "heading", "headline", "product_name", "productName"],
  url: ["url", "link", "href", "permalink", "product_url", "productUrl"],
  snippet: [
    "snippet",
    "description",
    "excerpt",
    "tagline",
    "summary",
    "body",
    "text",
    "blurb",
  ],
  published_at: [
    "published_at",
    "publishedAt",
    "date",
    "datetime",
    "launch_date",
    "launchDate",
    "launched_at",
    "created_at",
    "createdAt",
  ],
  source_domain: ["source_domain", "sourceDomain", "domain", "host", "hostname"],
} as const;

function pick(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Alias layer, run *before* Zod. A collector that renames `tagline` to
 * `description` is cheap schema drift; it should not burn a heal credit.
 * A collector that returns nothing for any of them is a layout change, and
 * that must still reach the validator as a failure.
 *
 * Deliberately assigns no fallback values to required fields. Defaulting a
 * missing title to "unknown" or a missing url to a placeholder is a tempting
 * way to make a normalizer look tidy, and it hides exactly the breakage this
 * layer exists to catch. Missing stays missing; the schema decides.
 */
export type NormalizeOptions = {
  /**
   * Fall back to the trigger input's url when a row carries none.
   *
   * Off by default, and that default is load-bearing. It is only correct for
   * single-page (PDP) collectors, where the row genuinely *is* the page that
   * was requested. On a listing shape it actively hides breakage: a watch
   * collector that stopped extracting per-item links returned rows whose url
   * silently resolved to the listing page itself, so `url` never appeared in
   * the validation issues and the heal prompt was built from an incomplete
   * picture of what had broken.
   */
  allowInputUrlFallback?: boolean;
};

export function normalizeRow(
  source: HitSource,
  row: unknown,
  opts: NormalizeOptions = {},
): unknown {
  if (!row || typeof row !== "object") return row;
  const r = row as Record<string, unknown>;

  // Studio sometimes nests the trigger input alongside the extracted fields.
  const input = (r.input ?? {}) as Record<string, unknown>;

  const url =
    str(pick(r, ALIASES.url)) ||
    (opts.allowInputUrlFallback ? str(input.url) : "");
  const publishedRaw = pick(r, ALIASES.published_at);

  return {
    source: HitSourceSchema.safeParse(r.source).success ? r.source : source,
    title: str(pick(r, ALIASES.title)),
    url,
    snippet: str(pick(r, ALIASES.snippet)),
    published_at: publishedRaw === undefined ? null : str(publishedRaw) || null,
    source_domain: str(pick(r, ALIASES.source_domain)) || domainFromUrl(url),
  };
}
