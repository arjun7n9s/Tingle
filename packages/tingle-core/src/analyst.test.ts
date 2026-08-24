import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ANALYST_REFUSAL, analystReply } from "./analyst.js";
import { emptyPiles } from "./piles.js";
import type { FirstLookResult } from "./jobs/firstLook.js";

const look = {
  status: "ok",
  claim: "a watch that tells indie builders when someone else ships their idea",
  fingerprints: [],
  claim_graph: {
    object: "watch",
    function: "tells indie builders",
    mechanism: "public listing match",
    setting: "",
    queries: { patents: [], papers: [], products: ["indie watch"] },
    must_concepts: ["watch", "indie builders"],
    setting_terms: [],
  },
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
    storage: "vault",
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
    extra_watch_skipped: [],
    extra_watch_rejected: [],
    mock: true,
    search_listing_url: "https://dev.to/t/indiehackers",
    dropped_sample: [],
    dropped_count: 0,
  },
  baseline: { project_id: "p", at: "", hit_ids: ["1"], urls: [], content_hashes: [] },
  heal_events: [],
  analyst_contract: "I only report what the scrapers returned.",
} as FirstLookResult;

describe("answerAnalyst", () => {
  it("uses the assembler when no LLM key is configured", async () => {
    const { answerAnalyst } = await import("./analyst.js");
    const r = await answerAnalyst("what did Search return?", look);
    assert.equal(r.narrated, false);
    assert.match(r.text, /Claim watch post/);
  });
});

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
    assert.doesNotMatch(r.text, /I don't have a tool/i);
  });

  it("names Tingle, not a model, on identity questions", () => {
    const name = analystReply("what's your name?", look);
    assert.equal(name.covered, true);
    assert.match(name.text, /Tingle/i);
    assert.doesNotMatch(name.text, /Ask me what the look/i);
    assert.doesNotMatch(name.text, /I don't have a tool/i);

    const model = analystReply("which AI model are you using?", look);
    assert.equal(model.covered, true);
    assert.match(model.text, /Tingle/i);
    assert.match(model.text, /No chat model is configured/i);
    assert.doesNotMatch(model.text, /I don't have a tool/i);

    const named = analystReply("which model are you using?", look, {
      llm: {
        apiKey: "test",
        model: "gpt-4o",
        url: "https://api.aimlapi.com/v1/chat/completions",
      },
    });
    assert.match(named.text, /gpt-4o/);
    assert.match(named.text, /AIML/i);
    assert.match(named.text, /Tingle/i);

    const site = analystReply("tell me about this site, what is the name of this tool?", look);
    assert.equal(site.covered, true);
    assert.match(site.text, /Tingle/);
    assert.match(site.text, /claim/i);
    assert.doesNotMatch(site.text, /I don't have a tool/i);

    const chatgpt = analystReply("are you ChatGPT?", look, {
      llm: {
        apiKey: "test",
        model: "gpt-4o",
        url: "https://api.aimlapi.com/v1/chat/completions",
      },
    });
    assert.equal(chatgpt.covered, true);
    assert.match(chatgpt.text, /Tingle/i);
    assert.match(chatgpt.text, /not ChatGPT/i);
    assert.doesNotMatch(chatgpt.text, /I don't have/i);

    const job = analystReply("what can you do?", look);
    assert.equal(job.covered, true);
    assert.match(job.text, /Tingle/i);
    assert.match(job.text, /look/i);
    assert.doesNotMatch(job.text, /I don't have a tool/i);
  });

  it("explains an empty Search ranking instead of dumping the contract", () => {
    const empty = {
      ...look,
      claim: "I wanna make haptic navigation gloves, for riders",
      piles: emptyPiles(),
      quality: {
        ...look.quality,
        hits_scraped: 3,
        hits_matched: 0,
        dropped_sample: [
          "How I roast coffee beans in a studio apartment (dev.to)",
        ],
        dropped_count: 1,
      },
    } as FirstLookResult;
    const r = analystReply("I wanna make haptic navigation gloves, for riders", empty);
    assert.match(r.text, /haptic navigation gloves/i);
    assert.match(r.text, /dev\.to\/t\/indiehackers/);
    assert.doesNotMatch(r.text, /I only report what the scrapers returned for this project/);
    assert.match(r.text, /roast coffee/);
    assert.match(r.text, /will not invent/i);
    assert.match(r.text, /fixtures \(mock\)/);
  });
});
