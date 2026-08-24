import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTingleConfig } from "../config.js";
import { MOCK_UNLOCKER_MARKDOWN } from "../bd/unlocker.js";
import { enrichPatentDetails, isPatentDetailUrl } from "./patentDetails.js";
import type { PileableHit } from "../piles.js";

function hit(partial: Partial<PileableHit> & Pick<PileableHit, "url" | "title">): PileableHit {
  return {
    source: "patent",
    snippet: "card blurb",
    published_at: null,
    source_domain: "patents.google.com",
    collector: "patent",
    ...partial,
  };
}

describe("isPatentDetailUrl", () => {
  it("skips patents.google.com (Unlocker refuses the host) and keeps other offices", () => {
    assert.equal(
      isPatentDetailUrl("https://patents.google.com/patent/US20140142851A1"),
      false,
    );
    assert.equal(isPatentDetailUrl("https://patents.google.com/?q=robot"), false);
    assert.equal(
      isPatentDetailUrl("https://patentscope.wipo.int/search/en/detail.jsf?docId=WO123"),
      true,
    );
    assert.equal(isPatentDetailUrl("http://patentscope.wipo.int/x"), false);
  });
});

describe("enrichPatentDetails", () => {
  it("fills a short snippet from Unlocker markdown in mock", async () => {
    const config = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_UNLOCKER_ZONE: "unit-test-zone",
    } as NodeJS.ProcessEnv);
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("mock must not fetch");
    }) as typeof fetch;
    try {
      const result = await enrichPatentDetails(config, [
        hit({
          url: "https://patentscope.wipo.int/search/en/detail.jsf?docId=WO20140142851",
          title: "Example filing",
          snippet: "short",
          source_domain: "patentscope.wipo.int",
        }),
      ]);
      assert.equal(calls, 0);
      assert.equal(result.fetched, 1);
      assert.equal(result.hits[0]?.snippet.includes("deterministic"), true);
      assert.match(MOCK_UNLOCKER_MARKDOWN, /patent/);
      assert.equal(result.hits[0]?.title, "Example filing");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not invent a title when the listing left it blank", async () => {
    const config = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_UNLOCKER_ZONE: "unit-test-zone",
    } as NodeJS.ProcessEnv);
    const result = await enrichPatentDetails(config, [
      hit({
        url: "https://patentscope.wipo.int/search/en/detail.jsf?docId=WO20140142851",
        title: "",
        snippet: "card",
        source_domain: "patentscope.wipo.int",
      }),
    ]);
    assert.equal(result.hits[0]?.title, "");
  });

  it("skips when no Unlocker zone is configured", async () => {
    const config = loadTingleConfig({ TINGLE_MOCK: "1" } as NodeJS.ProcessEnv);
    const result = await enrichPatentDetails(config, [
      hit({
        url: "https://patentscope.wipo.int/search/en/detail.jsf?docId=WO20140142851",
        title: "Example filing",
        source_domain: "patentscope.wipo.int",
      }),
    ]);
    assert.equal(result.fetched, 0);
    assert.equal(result.skipped, "missing_unlocker_zone");
  });
});
