import type { ScoredHit } from "./piles.js";
import { normalizeText } from "./claim.js";

export type AnalystContext = {
  claim: string;
  hits: ScoredHit[];
  /** Every lane that ran this turn, and whether it came back. */
  sources: Array<{ name: string; kind: string; ok: boolean; rows: number; error?: string }>;
};

export type AnalystAnswer = {
  /** Which tool answered. `null` means nothing did, and we say so. */
  tool: string | null;
  text: string;
  rows: ScoredHit[];
  /** Always shown as a collapsible footer, never as a chat reply. */
  sources_used: string[];
};

export const ANALYST_CONTRACT =
  "I only report what the scrapers returned for this project. I do not invent " +
  "products, papers, or patents. If a source did not come back, I will say it " +
  "did not come back.";

type Tool = {
  name: string;
  /** Matched against the normalised question. */
  matches: RegExp;
  run: (ctx: AnalystContext, q: string) => { text: string; rows: ScoredHit[] };
};

const TOOLS: Tool[] = [
  {
    name: "filter_by_source",
    matches:
      /\b(what did|show( me)?|list)\b.*\b(search|watch|chaos|hacker ?news|hn|arxiv|github|adjunct)\b|\b(search|watch|hn|arxiv|github)\b.*\b(return|find|show)\b/,
    run: (ctx, q) => {
      const wanted = matchOrigin(q);
      if (!wanted) {
        return { text: "I could not tell which source you meant.", rows: [] };
      }
      const rows = ctx.hits.filter((h) => h.origin.includes(wanted.key));
      const src = ctx.sources.find((s) => s.name.includes(wanted.key));
      if (src && !src.ok) {
        return {
          text: `${wanted.label} did not come back this run — ${
            src.error ?? "no reason reported"
          }. I have nothing from it to show you.`,
          rows: [],
        };
      }
      if (!rows.length) {
        return {
          text: `${wanted.label} returned rows, but none of them cleared the relevance threshold for this claim, so none are in the piles.`,
          rows: [],
        };
      }
      return {
        text: `${rows.length} hit(s) from ${wanted.label}.`,
        rows,
      };
    },
  },
  {
    name: "filter_recent",
    matches: /\b(recent|latest|new|last (7|seven) days|this week|just shipped)\b/,
    run: (ctx) => {
      const rows = ctx.hits.filter((h) => h.published_iso);
      rows.sort(
        (a, b) =>
          new Date(b.published_iso!).getTime() - new Date(a.published_iso!).getTime(),
      );
      if (!rows.length) {
        return {
          text: "None of the rows I have carry a date I could read, so I cannot order them by recency.",
          rows: [],
        };
      }
      return { text: `${rows.length} dated hit(s), newest first.`, rows: rows.slice(0, 10) };
    },
  },
  {
    name: "explain_hit",
    matches: /\bwhy\b.*\b(here|this|included|match)/,
    run: (ctx) => {
      const rows = [...ctx.hits].sort((a, b) => b.score - a.score).slice(0, 5);
      if (!rows.length) return { text: "There are no hits to explain.", rows: [] };
      const lines = rows.map(
        (h) => `· ${h.title} — ${h.reason} (score ${h.score})`,
      );
      return {
        text: `Each hit is here because it matched the claim's fingerprints:\n${lines.join(
          "\n",
        )}`,
        rows,
      };
    },
  },
  {
    name: "source_health",
    matches:
      /\b(which|what)\b.*\b(sources?|collectors?|lanes?)\b|\b(sources?|collectors?)\b.*\b(ran|used|fail|work)/,
    run: (ctx) => {
      const lines = ctx.sources.map(
        (s) =>
          `· ${s.name} — ${
            s.ok ? `${s.rows} row(s)` : `did not come back: ${s.error ?? "unknown"}`
          }`,
      );
      return { text: `Lanes this run:\n${lines.join("\n")}`, rows: [] };
    },
  },
  {
    name: "count_piles",
    matches: /\b(how many|count|total)\b/,
    run: (ctx) => ({
      text: `${ctx.hits.length} hit(s) cleared the threshold for this claim.`,
      rows: [],
    }),
  },
];

function matchOrigin(q: string): { key: string; label: string } | null {
  if (/\bhacker ?news\b|\bhn\b/.test(q)) return { key: "hn", label: "Hacker News" };
  if (/\barxiv\b/.test(q)) return { key: "arxiv", label: "arXiv" };
  if (/\bgithub\b/.test(q)) return { key: "github", label: "the repo lane" };
  if (/\bsearch\b/.test(q)) return { key: "search", label: "the search collector" };
  if (/\bwatch\b/.test(q)) return { key: "watch", label: "the watch collector" };
  if (/\bchaos\b/.test(q)) return { key: "chaos", label: "the chaos collector" };
  return null;
}

/**
 * Answer a follow-up, or refuse.
 *
 * Every answer comes from a tool that reads stored rows. There is no model in
 * this path, so the analyst cannot produce a market forecast, a valuation, or a
 * competitor it did not scrape — not because it was told not to, but because
 * there is nothing here capable of inventing one. Questions no tool covers get
 * told exactly that.
 */
export function askAnalyst(ctx: AnalystContext, question: string): AnalystAnswer {
  const q = normalizeText(question);
  const sources_used = ctx.sources.filter((s) => s.ok).map((s) => s.name);

  if (!q.trim()) {
    return {
      tool: null,
      text: "Ask me something about what the collectors returned for this project.",
      rows: [],
      sources_used,
    };
  }

  for (const tool of TOOLS) {
    if (tool.matches.test(q)) {
      const { text, rows } = tool.run(ctx, q);
      return { tool: tool.name, text, rows, sources_used };
    }
  }

  return {
    tool: null,
    text:
      "No tool I have covers that. I can only report what the collectors " +
      "returned for this project — which lanes ran, what they returned, how " +
      "recent it is, and why a hit matched the claim. I will not guess at " +
      "market size, valuations, or who wins.",
    rows: [],
    sources_used,
  };
}
