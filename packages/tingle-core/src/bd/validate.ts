import {
  HitRowSchema,
  normalizeRow,
  type HitRow,
  type HitSource,
} from "../schema/hits.js";

export type ValidationResult = {
  ok: HitRow[];
  issues: string[];
};

/**
 * Zod is the tripwire. Empty dataset and empty required fields are incidents,
 * not "nothing in the niche." Invalid rows are never returned as success.
 */
export function validateRows(
  source: HitSource,
  rows: unknown[],
): ValidationResult {
  const ok: HitRow[] = [];
  const issues: string[] = [];
  if (!rows.length) {
    issues.push("empty dataset — extractor likely broken, not an empty niche");
    return { ok, issues };
  }
  for (const [i, row] of rows.entries()) {
    const parsed = HitRowSchema.safeParse(normalizeRow(source, row));
    if (parsed.success) {
      ok.push(parsed.data);
    } else {
      for (const issue of parsed.error.issues) {
        const path = issue.path.length ? issue.path.join(".") : "row";
        issues.push(`[${i}] ${path}: ${issue.message}`);
      }
    }
  }
  return { ok, issues };
}

/**
 * Heal prompts name the frozen HitRow fields. Bright Data caps the body at
 * 1000 characters; we clip here so the client does not have to.
 */
export function buildHealPrompt(source: HitSource, issues: string[]): string {
  return [
    `The ${source} scraper output failed schema validation after a likely site layout change.`,
    `Missing or invalid fields: ${issues.join("; ")}.`,
    `Re-extract using plain-language descriptions: title (product or post name), url (item permalink), snippet (tagline, subtitle, or first line), published_at (date if shown, else null), source_domain (host of url).`,
    `Keep the same JSON field names: title, url, snippet, published_at, source_domain.`,
    `Fix selectors for the current DOM. Public HTML only. Do not require login.`,
  ]
    .join(" ")
    .slice(0, 1000);
}

export function isValidationSuccess(result: ValidationResult): boolean {
  return result.ok.length > 0 && result.issues.length === 0;
}

/**
 * Live chaos heal: the hosted fixture has two selector sets (index vs
 * broken.html). Ask the extractor to accept both so we do not brick the
 * original page while proving a real DOM break.
 */
export function buildChaosDualSelectorHealPrompt(issues: string[]): string {
  return [
    `The chaos listing failed schema validation after a DOM redesign.`,
    `Issues: ${issues.join("; ")}.`,
    `Support BOTH layouts on this fixture.`,
    `Layout A (original cards): each article.hit-card; title .claim-title; url a.hit[href]; snippet .hit-snippet; published_at .hit-date[datetime].`,
    `Layout B (redesign table): each tr.launch-row; title td.name; url a.permalink[href]; snippet td.blurb; published_at time[datetime].`,
    `Keep JSON field names title, url, snippet, published_at, source_domain.`,
    `Public HTML only. No login.`,
  ]
    .join(" ")
    .slice(0, 1000);
}
