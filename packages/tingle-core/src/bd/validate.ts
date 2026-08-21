import {
  HitRowSchema,
  normalizeRow,
  type HitRow,
  type HitSource,
  type NormalizeOptions,
} from "../schema/hits.js";

export type IssueDetail = { row: number; path: string; message: string };

export type ValidationResult = {
  ok: HitRow[];
  /** Human-readable, one line per row+field. For logs and artifacts. */
  issues: string[];
  /** Structured form, so the heal prompt can group instead of string-parse. */
  issueDetails: IssueDetail[];
  /** Rows that arrived but failed the schema. Never treated as success. */
  rejected: number;
};

/**
 * The tripwire. Runs the alias layer first, then the schema.
 *
 * Zero rows is itself an issue — a collector that returns nothing looks
 * identical to an empty niche, and that is the false negative this product
 * cannot afford.
 */
export function validateRows(
  source: HitSource,
  rows: unknown[],
  opts: NormalizeOptions = {},
): ValidationResult {
  const ok: HitRow[] = [];
  const issues: string[] = [];
  const issueDetails: IssueDetail[] = [];
  let rejected = 0;

  if (!rows.length) {
    return {
      ok,
      issues: ["empty dataset — collector returned 0 rows"],
      issueDetails: [
        { row: -1, path: "(dataset)", message: "collector returned 0 rows" },
      ],
      rejected: 0,
    };
  }

  for (const [i, row] of rows.entries()) {
    const parsed = HitRowSchema.safeParse(normalizeRow(source, row, opts));
    if (parsed.success) {
      ok.push(parsed.data);
      continue;
    }
    rejected += 1;
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "(root)";
      issues.push(`[row ${i}] ${path}: ${issue.message}`);
      issueDetails.push({ row: i, path, message: issue.message });
    }
  }

  return { ok, issues, issueDetails, rejected };
}

/** Fields the heal prompt must always name, so a repair cannot rename them. */
const FROZEN_FIELDS =
  "title, url, snippet, published_at, source_domain";

/**
 * Build the heal prompt from the actual validation issues.
 *
 * A vague prompt ("it broke") invites a rewrite of the whole scraper. An
 * issue-derived prompt repairs selectors.
 *
 * Issues are grouped by field, not listed per row. A break usually hits the
 * same field on every row, and spelling that out sixteen times burns the
 * 1000-character cap saying four things — which then truncates the part that
 * actually constrains the repair.
 */
export function buildHealPrompt(
  source: HitSource,
  issues: IssueDetail[],
  opts: { maxChars?: number; totalRows?: number } = {},
): string {
  const maxChars = opts.maxChars ?? 1000;

  const head =
    `The ${source} collector failed schema validation, most likely after a ` +
    `layout change on the target page. Problems: `;
  const tail =
    ` Re-extract using plain-language descriptions of the content rather than ` +
    `brittle selectors. Keep exactly these JSON field names: ${FROZEN_FIELDS}. ` +
    `published_at must be an ISO date or null. Fix the selectors for the ` +
    `current DOM.`;

  const grouped = groupByField(issues);
  const budget = maxChars - head.length - tail.length;

  let body = "";
  for (const [i, entry] of grouped.entries()) {
    const next = body ? `${body}; ${entry}` : entry;
    if (next.length > budget) {
      const note = ` (+${grouped.length - i} more)`;
      if (body && body.length + note.length <= budget) body += note;
      break;
    }
    body = next;
  }
  if (!body) body = "required fields came back empty";

  return `${head}${body}.${tail}`.slice(0, maxChars);
}

/** `title: empty title (4 rows)` — one line per distinct field problem. */
function groupByField(issues: IssueDetail[]): string[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const key = `${issue.path}: ${issue.message}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, n]) =>
    n > 1 ? `${key} (${n} rows)` : key,
  );
}
