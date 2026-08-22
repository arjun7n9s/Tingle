import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ANALYST_REFUSAL, analystReply } from "./analyst.js";
import { emptyPiles } from "./piles.js";
import type { FirstLookResult } from "./jobs/firstLook.js";

const look = {
  status: "ok",
  claim: "a watch that tells indie builders when someone else ships their idea",
  fingerprints: [],
  profile: {
    project_id: "p",
    stage: "starting",
    claim: "a watch",
    fingerprints: [],
    must_match: [],
    ignore: [],
    sources: ["search"],
    baseline_ids: [],
    links: [],
    watch_list: [],
    tingle_on: false,
    digest_floor: "daily",
    budget: { cap: 50, spent: 0, lane: "cheap" },
    paused: false,
    stealth: false,
  },
  piles: {
    ...emptyPiles(),
    already_in_the_lane: [
      {
        source: "search",
        title: "Claim watch post",
        url: "https://dev.to/example/claim-watch",
        snippet: "indie builders",
        published_at: null,
        source_domain: "dev.to",
        id: "1",
        why: "match",
        collector: "search",
        content_hash: "a",
        entity_key: "dev.to::claim",
        days_old: null,
      },
    ],
  },
  sources_used: ["search"],
  collectors_failed: [],
  quality: {
    hit_count_per_pile: {
      stand_on_this: 0,
      already_in_the_lane: 1,
      shipped_last_7_days: 0,
    },
    collectors_returned: ["search"],
    zod_failures: [],
    empty_shipped_pile: true,
    hits_scraped: 3,
    hits_matched: 1,
  },
  baseline: { project_id: "p", at: "", hit_ids: ["1"], urls: [], content_hashes: [] },
  heal_events: [],
  analyst_contract: "I only report what the scrapers returned.",
} as FirstLookResult;

describe("analystReply", () => {
  it("answers what Search returned from JSON", () => {
    const r = analystReply("what did Search return?", look);
    assert.equal(r.covered, true);
    assert.match(r.text, /Claim watch post/);
  });

  it("refuses a market-winner question", () => {
    const r = analystReply("who will win the market?", look);
    assert.equal(r.covered, false);
    assert.equal(r.text, ANALYST_REFUSAL);
  });
});
