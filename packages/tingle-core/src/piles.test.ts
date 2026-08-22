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
});
