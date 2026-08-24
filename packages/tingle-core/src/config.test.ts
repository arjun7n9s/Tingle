import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTingleConfig } from "./config.js";

describe("loadTingleConfig llm", () => {
  it("points AIMLAPI_KEY at the AIML chat endpoint", () => {
    const cfg = loadTingleConfig({
      AIMLAPI_KEY: "test-key",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.llm?.url, "https://api.aimlapi.com/v1/chat/completions");
    assert.equal(cfg.llm?.model, "gpt-4o");
    assert.ok(cfg.llm?.apiKey);
  });

  it("accepts the hyphenated aimlapi-key alias", () => {
    const cfg = loadTingleConfig({
      "aimlapi-key": "test-key",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.llm?.url, "https://api.aimlapi.com/v1/chat/completions");
  });

  it("stays assembler-only when no key is set", () => {
    const cfg = loadTingleConfig({} as NodeJS.ProcessEnv);
    assert.equal(cfg.llm, undefined);
  });
});

describe("loadTingleConfig serpZone", () => {
  it("reads TINGLE_SERP_ZONE when set", () => {
    const cfg = loadTingleConfig({
      TINGLE_SERP_ZONE: "serp_google",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.serpZone, "serp_google");
  });

  it("stays unset when the zone is blank", () => {
    const cfg = loadTingleConfig({} as NodeJS.ProcessEnv);
    assert.equal(cfg.serpZone, undefined);
  });
});

describe("loadTingleConfig unlockerZone", () => {
  it("reads TINGLE_UNLOCKER_ZONE when set", () => {
    const cfg = loadTingleConfig({
      TINGLE_UNLOCKER_ZONE: "web_unlocker1",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.unlockerZone, "web_unlocker1");
  });

  it("stays unset when the zone is blank", () => {
    const cfg = loadTingleConfig({} as NodeJS.ProcessEnv);
    assert.equal(cfg.unlockerZone, undefined);
  });
});

describe("loadTingleConfig premium token", () => {
  it("does not replace the Studio apiToken with the premium SERP token", () => {
    const cfg = loadTingleConfig({
      BRIGHT_DATA_API_TOKEN: "studio-token",
      TINGLE_PREMIUM_API_TOKEN: "premium-token",
      TINGLE_SERP_ZONE: "serp_api",
      TINGLE_BROWSER_API_USER: "brd-customer-example-zone-browser_api",
      TINGLE_BROWSER_API_PASSWORD: "not-the-studio-token",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.apiToken, "studio-token");
    assert.equal(cfg.serpToken, "premium-token");
    assert.equal(cfg.serpZone, "serp_api");
    assert.equal(cfg.browserApi?.username, "brd-customer-example-zone-browser_api");
    assert.notEqual(cfg.apiToken, cfg.serpToken);
  });

  it("reads TINGLE_PREMIUM_UNLOCKER_ZONE without touching Studio apiToken", () => {
    const cfg = loadTingleConfig({
      BRIGHT_DATA_API_TOKEN: "studio-token",
      TINGLE_PREMIUM_UNLOCKER_ZONE: "web_unlocker_api",
      TINGLE_PATENT_OVERLAP_MIN: "0.7",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.apiToken, "studio-token");
    assert.equal(cfg.premiumUnlockerZone, "web_unlocker_api");
    assert.equal(cfg.patentOverlapMin, 0.7);
  });
});

describe("loadTingleConfig webhooks", () => {
  it("reads optional alert hook URLs", () => {
    const cfg = loadTingleConfig({
      TINGLE_WEBHOOK_URL: "https://example.com/hook",
      TINGLE_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/x",
      TINGLE_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/x",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.webhookUrl, "https://example.com/hook");
    assert.equal(cfg.slackWebhookUrl, "https://hooks.slack.com/services/x");
    assert.equal(cfg.discordWebhookUrl, "https://discord.com/api/webhooks/x");
  });
});

describe("loadTingleConfig mock pins", () => {
  it("synthesizes search/watch/chaos pins in mock so the state machine still runs", () => {
    const cfg = loadTingleConfig({
      TINGLE_MOCK: "1",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.mock, true);
    assert.equal(cfg.collectors.search, "mock_search");
    assert.equal(cfg.collectors.watch, "mock_watch");
    assert.equal(cfg.collectors.chaos, "mock_chaos");
    assert.equal(cfg.collectors.region_us, "mock_watch");
    assert.equal(cfg.collectors.patent, undefined);
  });

  it("does not invent a Google Patents pin in mock", () => {
    const cfg = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_C_SEARCH: "c_real_search",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.collectors.search, "c_real_search");
    assert.equal(cfg.collectors.patent, undefined);
  });
});
