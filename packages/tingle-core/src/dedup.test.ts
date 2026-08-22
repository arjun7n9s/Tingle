import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clusterHits,
  isMuted,
  muteTokens,
  sameEntity,
  titleKey,
} from "./dedup.js";
import { contentHash, entityKey, hitId, type PileHit } from "./piles.js";

function hit(
  source: string,
  title: string,
  url: string,
  snippet: string,
): PileHit {
  const row = {
    source,
    title,
    url,
    snippet,
    published_at: "2026-08-22",
    source_domain: new URL(url).hostname.replace(/^www\./, ""),
  };
  return {
    ...row,
    id: hitId(url),
    why: "test",
    collector: source,
    content_hash: contentHash(row),
    entity_key: entityKey(row),
    days_old: 0,
  };
}

describe("dedup", () => {
  it("collapses the same title on Search + Watch + HN into one cluster", () => {
    const title = "ClaimSnitch";
    const snippet =
      "a watch that tells indie builders when someone else ships their idea";
    const grouped = clusterHits([
      hit("search", title, "https://dev.to/x/claimsnitch", snippet),
      hit("watch", title, "https://www.uneed.best/tool/claimsnitch", snippet),
      hit("hn", title, "https://news.ycombinator.com/item?id=42", snippet),
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]?.length, 3);
    assert.ok(
      sameEntity(grouped[0]![0]!, grouped[0]![2]!),
      "HN and Search should be the same entity",
    );
  });

  it("does not merge unrelated titles", () => {
    const grouped = clusterHits([
      hit("watch", "ClaimSnitch", "https://www.uneed.best/tool/claimsnitch", "idea watch"),
      hit("watch", "BeanCounter", "https://www.uneed.best/tool/beancounter", "coffee stamps"),
    ]);
    assert.equal(grouped.length, 2);
  });

  it("mute tokens suppress the whole cluster", () => {
    const a = hit(
      "search",
      "ClaimSnitch",
      "https://dev.to/x/claimsnitch",
      "indie builders",
    );
    const b = hit(
      "hn",
      "ClaimSnitch",
      "https://news.ycombinator.com/item?id=42",
      "indie builders",
    );
    const ignore = muteTokens(a);
    assert.ok(ignore.includes(titleKey("ClaimSnitch")));
    assert.equal(isMuted(a, ignore), true);
    assert.equal(isMuted(b, ignore), true);
  });
});
