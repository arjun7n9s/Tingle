import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lexicalOverlap } from "./claimCompare.js";
import { patentSiteQueries, stampRegional } from "./serpDiscovery.js";

describe("lexicalOverlap", () => {
  it("scores distinctive overlap and does not invent a patent", () => {
    const claim = "haptic wearable that vibrates when a nearby claim ships";
    const hit = "A haptic wearable alert watch that vibrates on nearby events";
    const other = "stainless steel espresso portafilter gasket";
    assert.ok(lexicalOverlap(claim, hit) > lexicalOverlap(claim, other));
    assert.ok(lexicalOverlap(claim, other) < 0.4);
  });
});

describe("patentSiteQueries", () => {
  it("emits five site: queries and no invented filing numbers", () => {
    const qs = patentSiteQueries("haptic wearable alert");
    assert.equal(qs.length, 5);
    assert.ok(qs.some((q) => q.includes("site:patents.google.com")));
    assert.ok(qs.some((q) => q.includes("site:patentscope.wipo.int")));
    assert.ok(!qs.some((q) => /US\d{7}/.test(q)));
  });
});

describe("stampRegional", () => {
  it("tags by the engine we queried, not the result host", () => {
    const row = stampRegional(
      {
        source: "serp",
        title: "Local clone",
        url: "https://example.ru/watch",
        snippet: "A watch for indie builders",
        published_at: null,
        source_domain: "example.ru",
      },
      "yandex",
    );
    assert.equal(row.region, "yandex");
    assert.equal(row.home, false);
  });
});
