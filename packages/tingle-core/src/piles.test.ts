import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockRowsFor } from "./bd/mock.js";
import { normalizeRow, type HitRow } from "./schema/hits.js";
import { HitRowSchema } from "./schema/hits.js";
import { mapHitsToPiles } from "./piles.js";
import { proposeClaim } from "./claim.js";

const NOW = new Date("2026-08-22T12:00:00.000Z");

function asHits(source: "search" | "watch"): HitRow[] {
  return mockRowsFor(source).map((row) => {
    const parsed = HitRowSchema.parse(normalizeRow(source, row));
    return parsed;
  });
}

describe("mapHitsToPiles", () => {
  const { fingerprints, must_match } = proposeClaim({
    claim: "a watch that tells indie builders when someone else ships their idea",
  });

  it("ranks the DEV listing against the claim instead of dumping every card", () => {
    const piles = mapHitsToPiles(asHits("search"), {
      fingerprints,
      must_match,
      now: NOW,
    });
    const titles = [
      ...piles.stand_on_this,
      ...piles.already_in_the_lane,
      ...piles.shipped_last_7_days,
    ].map((h) => h.title);
    assert.ok(titles.some((t) => /claim watch/i.test(t)));
    assert.ok(!titles.some((t) => /coffee/i.test(t)));
  });

  it("puts github/docs-shaped rows on stand_on_this", () => {
    const piles = mapHitsToPiles(asHits("search"), {
      fingerprints,
      must_match,
      now: NOW,
    });
    assert.ok(
      piles.stand_on_this.some((h) => /github\.com/i.test(h.url)),
      "expected the fingerprint library row in stand_on_this",
    );
  });

  it("allows an empty shipped pile without looking like a bug", () => {
    const piles = mapHitsToPiles(asHits("search"), {
      fingerprints,
      must_match,
      now: new Date("2026-12-01T00:00:00.000Z"),
    });
    assert.equal(piles.shipped_last_7_days.length, 0);
  });

  it("does not invent a fourth competitor", () => {
    const piles = mapHitsToPiles(asHits("watch"), {
      fingerprints,
      must_match,
      now: NOW,
    });
    const titles = [
      ...piles.stand_on_this,
      ...piles.already_in_the_lane,
      ...piles.shipped_last_7_days,
    ].map((h) => h.title);
    assert.ok(!titles.includes("InventedRival"));
    assert.ok(!titles.some((t) => /beancounter/i.test(t)));
    assert.ok(titles.some((t) => /laneping/i.test(t)));
  });

  it("puts patent-office rows on patent_landscape", () => {
    const hits = mockRowsFor("patent").map((row) => {
      const parsed = HitRowSchema.parse(normalizeRow("patent", row));
      return { ...parsed, collector: "patent", office: "uspto" };
    });
    const judged = Object.fromEntries(hits.map((h) => [h.url, "related_art" as const]));
    const piles = mapHitsToPiles(hits, {
      fingerprints,
      must_match,
      now: NOW,
      judged,
    });
    assert.ok(piles.patent_landscape.length > 0);
    assert.ok(
      piles.patent_landscape.some((h) => /robot|swarm|collaborative/i.test(`${h.title} ${h.snippet}`)),
    );
  });

  it("sends a foreign board row to fast_tracker", () => {
    const [row] = asHits("watch");
    assert.ok(row);
    const piles = mapHitsToPiles([{ ...row, home: false, region: "jp" }], {
      fingerprints,
      must_match,
      now: NOW,
    });
    assert.ok(piles.fast_tracker.some((h) => h.url === row.url));
    assert.ok(!piles.already_in_the_lane.some((h) => h.url === row.url));
  });

  it("puts high-overlap patents on patent_threats and papers on prior_art_papers", () => {
    const patent = {
      source: "serp",
      title: "Haptic wearable that alerts when a nearby claim ships",
      url: "https://patents.google.com/patent/US20140142851A1",
      snippet: "A haptic wearable watch vibrates when a nearby claim ships.",
      published_at: "2014-05-01T00:00:00.000Z",
      source_domain: "patents.google.com",
      office: "uspto",
      overlap_score: 0.82,
    };
    const paper = {
      source: "crossref",
      title: "Claim-level monitoring of public product launches",
      url: "https://doi.org/10.0000/claim-watch",
      snippet: "Matching a one-sentence product claim against public HTML listings.",
      published_at: "2025-08-01T00:00:00.000Z",
      source_domain: "doi.org",
    };
    const piles = mapHitsToPiles([patent, paper], {
      fingerprints,
      must_match,
      now: NOW,
      judged: {
        [patent.url]: "related_art",
        [paper.url]: "related_art",
      },
      overlap_min: 0.6,
    });
    assert.ok(piles.patent_threats.some((h) => h.url === patent.url));
    assert.ok(piles.prior_art_papers.some((h) => h.url === paper.url));
  });
});
