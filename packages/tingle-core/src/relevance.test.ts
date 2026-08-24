import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallbackCompile } from "./claimGraph.js";
import { mapHitsToPiles } from "./piles.js";
import { judgedForPiles, lexicalJudge } from "./relevance.js";
import type { PileableHit } from "./piles.js";

function hit(partial: Partial<PileableHit> & Pick<PileableHit, "title" | "url">): PileableHit {
  return {
    source: "arxiv",
    snippet: "",
    published_at: null,
    source_domain: "arxiv.org",
    ...partial,
  };
}

describe("lexicalJudge", () => {
  it("rejects a hit that only overlaps setting_terms", () => {
    const graph = fallbackCompile(
      "Small autonomous robots that work collaboratively in dangerous environments",
    );
    const label = lexicalJudge(
      {
        title: "Understanding and Detecting Dangerous Speech in Social Media",
        snippet: "Dangerous speech in online environments.",
        url: "http://arxiv.org/abs/2101.00001",
      },
      graph,
    );
    assert.equal(label, "setting_only");
  });

  it("keeps a lure-shaped row for a never-seen fishing claim", () => {
    const graph = fallbackCompile(
      "biodegradable fishing lure that dissolves after 48h",
    );
    const keep = lexicalJudge(
      {
        title: "A biodegradable fishing lure that dissolves in seawater",
        snippet: "The lure breaks down after two days in salt water.",
        url: "https://example.com/dissolving-lure",
      },
      graph,
    );
    assert.ok(keep === "same_invention" || keep === "related_art");
    const drop = lexicalJudge(
      {
        title: "Efficient environments for captioning social speech",
        snippet: "Dangerous speech online.",
        url: "https://example.com/speech",
      },
      graph,
    );
    assert.ok(drop === "setting_only" || drop === "unrelated");
  });
});

describe("judged piles", () => {
  it("maps only same_invention and related_art into piles", () => {
    const rows = [
      hit({
        title: "Dissolving fishing lure",
        url: "https://example.com/lure",
        snippet: "biodegradable lure",
      }),
      hit({
        title: "Dangerous speech detector",
        url: "https://example.com/speech",
        snippet: "social media",
      }),
    ];
    const piles = mapHitsToPiles(rows, {
      fingerprints: ["lure", "biodegradable"],
      judged: {
        "https://example.com/lure": "related_art",
        "https://example.com/speech": "setting_only",
      },
    });
    const urls = [
      ...piles.stand_on_this,
      ...piles.already_in_the_lane,
      ...piles.shipped_last_7_days,
    ].map((h) => h.url);
    assert.deepEqual(urls, ["https://example.com/lure"]);
    assert.equal(judgedForPiles([
      { ...rows[0]!, relevance: "related_art" },
      { ...rows[1]!, relevance: "setting_only" },
    ]).length, 1);
  });
});
