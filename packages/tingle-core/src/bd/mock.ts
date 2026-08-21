import type { HitSource } from "../schema/hits.js";

/**
 * Fixture rows for mock mode. Every name and URL here is synthetic — none of
 * them refer to a real product or company.
 *
 * The chaos rows mirror `fixtures/tingle-chaos/index.html` exactly, so mock
 * and live runs agree on what a healthy scrape looks like.
 */
const CHAOS_ROWS = [
  {
    title: "ClaimWatch",
    url: "https://chaos.example/launch/claimwatch",
    snippet:
      "Tells solo builders when somebody else ships the thing they are halfway through building. Watches launch boards and release notes.",
    published_at: "2026-08-20",
  },
  {
    title: "PriorArt Radar",
    url: "https://chaos.example/launch/priorart-radar",
    snippet:
      "Weekly digest of new filings and preprints that match a saved one-sentence description of your project.",
    published_at: "2026-08-18",
  },
  {
    title: "NicheFill",
    url: "https://chaos.example/launch/nichefill",
    snippet:
      "Directory of indie products grouped by the job they do, updated daily from public launch pages.",
    published_at: "2026-08-11",
  },
  {
    title: "ScrapeKeeper",
    url: "https://chaos.example/launch/scrapekeeper",
    snippet:
      "Hosted extractors that repair their own selectors when a target site redesigns, so downstream pipelines keep the same collector id.",
    published_at: "2026-07-29",
  },
];

const WATCH_ROWS = [
  {
    title: "Lanewatch",
    url: "https://board.example/p/lanewatch",
    snippet:
      "Watches a handful of public boards and tells you when a product lands that does the same job as yours.",
    published_at: "2026-08-21",
  },
  {
    title: "Sidequest Log",
    url: "https://board.example/p/sidequest-log",
    snippet:
      "Lightweight changelog hosting for side projects. Public page per release, RSS included.",
    published_at: "2026-08-19",
  },
  {
    title: "Fingerprint Feed",
    url: "https://board.example/p/fingerprint-feed",
    snippet:
      "Turns a paragraph about your project into a set of search phrases and reruns them on a schedule.",
    published_at: "2026-08-14",
  },
];

const SEARCH_ROWS = [
  {
    title: "Building a competitor watcher from public pages",
    url: "https://notes.example/posts/competitor-watcher",
    snippet:
      "Write-up on diffing public launch listings against a saved baseline instead of re-reporting the whole landscape every week.",
    published_at: "2026-08-12",
  },
  {
    title: "prior-art-cli",
    url: "https://code.example/tools/prior-art-cli",
    snippet:
      "Command line tool that checks a project description against public registries and prints what already exists.",
    published_at: "2026-06-30",
  },
  {
    title: "On false negatives in monitoring pipelines",
    url: "https://papers.example/abs/2608.11234",
    snippet:
      "Argues that a silently broken extractor is more damaging than an outage, because absence of results reads as a real finding.",
    published_at: "2026-08-05",
  },
];

function stamp(source: HitSource, rows: typeof CHAOS_ROWS) {
  return rows.map((r) => ({ ...r, source }));
}

export function mockRows(source: HitSource): unknown[] {
  switch (source) {
    case "chaos":
      return stamp(source, CHAOS_ROWS);
    case "watch":
      return stamp(source, WATCH_ROWS);
    case "search":
      return stamp(source, SEARCH_ROWS);
  }
}

/**
 * What a layout change actually looks like: the row wrapper still matches, so
 * the right number of rows comes back, but every field selector misses.
 *
 * Mirrors `fixtures/tingle-chaos/broken.html`, where the field classes are
 * renamed and the row wrapper is left alone.
 */
export function mockBrokenRows(source: HitSource): unknown[] {
  const count = source === "chaos" ? CHAOS_ROWS.length : 3;
  return Array.from({ length: count }, () => ({
    source,
    title: "",
    url: "",
    snippet: "",
    published_at: null,
  }));
}
