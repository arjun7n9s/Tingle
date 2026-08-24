import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrightDataClient } from "./bd/client.js";
import { loadTingleConfig } from "./config.js";
import { firstLook } from "./jobs/firstLook.js";

const config = loadTingleConfig({
  TINGLE_MOCK: "1",
  BRIGHT_DATA_API_TOKEN: "",
  BRIGHTDATA_API_KEY: "",
  TINGLE_SAMPLE_CLAIM:
    "a watch that tells indie builders when someone else ships their idea",
});

describe("firstLook", () => {
  it("refuses to spend credits until the claim is confirmed", async () => {
    const result = await firstLook(
      {
        pitch: config.sampleClaim,
        confirmed: false,
      },
      { config, client: new BrightDataClient(config) },
    );
    assert.equal(result.status, "needs_confirm");
    if (result.status === "needs_confirm") {
      assert.ok(result.proposed_claim.length > 0);
    }
  });

  it("returns three piles, sources_used, and collectors_failed from scraper JSON only", async () => {
    const result = await firstLook(
      {
        pitch: config.sampleClaim,
        claim: config.sampleClaim,
        confirmed: true,
        stage: "starting",
        github_url: "https://github.com/example/claim-fingerprint",
      },
      { config, client: new BrightDataClient(config) },
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.ok("stand_on_this" in result.piles);
    assert.ok("already_in_the_lane" in result.piles);
    assert.ok("shipped_last_7_days" in result.piles);
    assert.ok(Array.isArray(result.sources_used));
    assert.ok(Array.isArray(result.collectors_failed));
    assert.ok(result.sources_used.includes("search"));
    assert.ok(result.sources_used.includes("watch"));
    const titles = [
      ...result.piles.stand_on_this,
      ...result.piles.already_in_the_lane,
      ...result.piles.shipped_last_7_days,
    ].map((h) => h.title);
    assert.ok(!titles.some((t) => /coffee|espresso|beancounter/i.test(t)));
    assert.ok(
      result.quality.dropped_sample.some((s) => /coffee/i.test(s)),
      "dropped listing noise should be named, not stuffed into a pile",
    );
    assert.ok(result.quality.dropped_count >= result.quality.dropped_sample.length);
    assert.ok(result.quality.dropped_count >= 1);
    assert.equal(result.quality.mock, true);
    assert.ok(result.claim_graph.must_concepts.length >= 1);
    assert.equal(
      result.analyst_contract.includes("I do not invent products"),
      true,
    );
  });

  it("scrapes extra long-tail URLs only on the deep lane, via the Watch collector", async () => {
    const extra = "https://www.uneed.best/tool/extra-lane";
    const cheap = await firstLook(
      {
        pitch: config.sampleClaim,
        claim: config.sampleClaim,
        confirmed: true,
        watch_list: [extra, "https://github.com/foo/bar"],
        lane: "cheap",
      },
      { config, client: new BrightDataClient(config) },
    );
    assert.equal(cheap.status, "ok");
    if (cheap.status !== "ok") return;
    assert.ok(cheap.quality.extra_watch_skipped.some((s) => s.includes(extra)));
    assert.ok(cheap.quality.extra_watch_rejected.some((s) => /github/i.test(s)));
    assert.ok(!cheap.quality.collectors_returned.some((s) => s.startsWith("watch:")));
    assert.equal(cheap.quality.marketplace_label, undefined);

    const deep = await firstLook(
      {
        pitch: config.sampleClaim,
        claim: config.sampleClaim,
        confirmed: true,
        watch_list: [extra],
        lane: "deep",
      },
      { config, client: new BrightDataClient(config) },
    );
    assert.equal(deep.status, "ok");
    if (deep.status !== "ok") return;
    assert.ok(deep.quality.collectors_returned.some((s) => s.startsWith("watch:")));
    assert.ok(deep.sources_used.includes("chatgpt_dataset"));
    assert.ok(!deep.quality.collectors_returned.includes("chatgpt_dataset"));
    assert.match(deep.quality.marketplace_label ?? "", /not Scraper Studio/i);
  });

  it("skips Studio collectors when lanes is an empty list", async () => {
    const result = await firstLook(
      {
        pitch: config.sampleClaim,
        claim: config.sampleClaim,
        confirmed: true,
        lanes: [],
      },
      { config, client: new BrightDataClient(config) },
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.ok(!result.quality.collectors_returned.includes("search"));
    assert.ok(!result.quality.collectors_returned.includes("watch"));
    assert.ok(result.sources_used.includes("hn"));
  });

  it("for a JP look, Uneed is not home and an unpinned Google Patents pin is a collector failure", async () => {
    const result = await firstLook(
      {
        pitch: config.sampleClaim,
        claim: config.sampleClaim,
        confirmed: true,
        geo_country: "JP",
      },
      { config, client: new BrightDataClient(config) },
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.ok(
      result.collectors_failed.some((s) => s.startsWith("patent:")),
      "unpinned Google Patents must be a collector failure, not an empty Japan niche",
    );
    assert.ok(result.collectors_failed.some((s) => s.startsWith("region_jp:")));
    assert.ok(result.sources_used.includes("search"));
  });

  it("records Google Patents in collectors_returned when TINGLE_C_PATENT is pinned", async () => {
    const pinned = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_C_PATENT: "c_mock_patent",
    } as NodeJS.ProcessEnv);
    const result = await firstLook(
      {
        pitch: pinned.sampleClaim,
        claim: pinned.sampleClaim,
        confirmed: true,
      },
      { config: pinned, client: new BrightDataClient(pinned) },
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.ok(result.quality.collectors_returned.includes("patent"));
    assert.ok(!result.collectors_failed.some((s) => s.startsWith("patent:")));
  });

  it("uses Unlocker on patent detail URLs when a zone is set", async () => {
    const pinned = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_C_PATENT: "c_mock_patent",
      TINGLE_UNLOCKER_ZONE: "unit-test-zone",
    } as NodeJS.ProcessEnv);
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("mock must not fetch");
    }) as typeof fetch;
    try {
      const result = await firstLook(
        {
          pitch: pinned.sampleClaim,
          claim: pinned.sampleClaim,
          confirmed: true,
        },
        { config: pinned, client: new BrightDataClient(pinned) },
      );
      assert.equal(result.status, "ok");
      if (result.status !== "ok") return;
      assert.equal(calls, 0);
      assert.ok(result.sources_used.includes("unlocker"));
    } finally {
      globalThis.fetch = original;
    }
  });
});
