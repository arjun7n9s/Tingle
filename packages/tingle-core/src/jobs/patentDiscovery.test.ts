import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTingleConfig } from "../config.js";
import {
  fetchPatentDiscovery,
  isPatentDiscoveryUrl,
  patentSerpQuery,
} from "./patentDiscovery.js";

describe("patentSerpQuery", () => {
  it("scopes Google to patents.google.com and does not invent a filing", () => {
    assert.equal(
      patentSerpQuery("haptic wearable alert"),
      "site:patents.google.com haptic wearable alert",
    );
  });
});

describe("isPatentDiscoveryUrl", () => {
  it("keeps patent detail URLs and drops generic Google hits", () => {
    assert.equal(
      isPatentDiscoveryUrl("https://patents.google.com/patent/US20140142851A1"),
      true,
    );
    assert.equal(isPatentDiscoveryUrl("https://www.google.com/search?q=haptic"), false);
    assert.equal(
      isPatentDiscoveryUrl("https://patentscope.wipo.int/search/en/detail.jsf?docId=WO1"),
      true,
    );
  });
});

describe("fetchPatentDiscovery", () => {
  it("skips in mock and does not fetch", async () => {
    const config = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_SERP_ZONE: "serp_api",
      TINGLE_PREMIUM_API_TOKEN: "premium-token",
      BRIGHT_DATA_API_TOKEN: "studio-token",
    } as NodeJS.ProcessEnv);
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("mock must not fetch");
    }) as typeof fetch;
    try {
      const result = await fetchPatentDiscovery(config, "haptic wearable");
      assert.equal(calls, 0);
      assert.equal(result.rows.length, 0);
      assert.equal(result.skipped, "serp_unconfigured");
    } finally {
      globalThis.fetch = original;
    }
  });
});
