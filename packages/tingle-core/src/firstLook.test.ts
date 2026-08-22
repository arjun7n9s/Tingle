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
    assert.equal(
      result.analyst_contract.includes("I do not invent products"),
      true,
    );
  });
});
