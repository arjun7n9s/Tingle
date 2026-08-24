import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTingleConfig } from "../config.js";
import {
  MOCK_UNLOCKER_LISTING_MARKDOWN,
  MOCK_UNLOCKER_MARKDOWN,
  fetchUnlockerMarkdown,
} from "./unlocker.js";

describe("fetchUnlockerMarkdown", () => {
  it("returns the fixture in mock without calling the network", async () => {
    const configs = [
      loadTingleConfig({
        TINGLE_UNLOCKER_ZONE: "unit-test-zone",
      } as NodeJS.ProcessEnv),
      loadTingleConfig({
        BRIGHT_DATA_API_TOKEN: "not-a-real-token",
        TINGLE_MOCK: "1",
        TINGLE_UNLOCKER_ZONE: "unit-test-zone",
      } as NodeJS.ProcessEnv),
    ];
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("mock mode must not fetch");
    }) as typeof fetch;

    try {
      for (const config of configs) {
        const result = await fetchUnlockerMarkdown(
          config,
          "https://patents.google.com/patent/US20140142851A1",
        );
        assert.equal("skipped" in result, false);
        if ("skipped" in result) return assert.fail(result.reason);
        assert.equal(result.markdown, MOCK_UNLOCKER_MARKDOWN);
        assert.equal(result.status, 200);
        assert.equal(result.bytes, Buffer.byteLength(MOCK_UNLOCKER_MARKDOWN));
      }
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns listing markdown for Google Patents search URLs", async () => {
    const config = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_UNLOCKER_ZONE: "unit-test-zone",
    } as NodeJS.ProcessEnv);
    const result = await fetchUnlockerMarkdown(
      config,
      "https://patents.google.com/?q=haptic",
    );
    assert.equal("skipped" in result, false);
    if ("skipped" in result) return assert.fail(result.reason);
    assert.equal(result.markdown, MOCK_UNLOCKER_LISTING_MARKDOWN);
  });

  it("skips cleanly when no zone is configured", async () => {
    const mock = await fetchUnlockerMarkdown(
      loadTingleConfig({ TINGLE_MOCK: "1" } as NodeJS.ProcessEnv),
      "https://example.com/paper",
    );
    assert.deepEqual(mock, { skipped: true, reason: "missing_unlocker_zone" });

    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("missing zone must not fetch");
    }) as typeof fetch;
    try {
      const liveShaped = await fetchUnlockerMarkdown(
        loadTingleConfig({
          BRIGHT_DATA_API_TOKEN: "unit-test-token",
        } as NodeJS.ProcessEnv),
        "https://example.com/paper",
      );
      assert.deepEqual(liveShaped, {
        skipped: true,
        reason: "missing_unlocker_zone",
      });
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("posts the documented markdown request and caps the response", async () => {
    const config = loadTingleConfig({
      BRIGHT_DATA_API_TOKEN: "unit-test-token",
      TINGLE_UNLOCKER_ZONE: "unit-test-zone",
    } as NodeJS.ProcessEnv);
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = (async (input, init) => {
      request = new Request(input, init);
      return new Response("x".repeat(20_010), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await fetchUnlockerMarkdown(
        config,
        "https://patents.google.com/patent/US20140142851A1",
        { country: "US" },
      );
      assert.equal("skipped" in result, false);
      if ("skipped" in result) return assert.fail(result.reason);
      assert.equal(request?.url, "https://api.brightdata.com/request");
      assert.equal(request?.method, "POST");
      assert.equal(
        request?.headers.get("Authorization"),
        "Bearer unit-test-token",
      );
      assert.deepEqual(await request?.json(), {
        zone: "unit-test-zone",
        url: "https://patents.google.com/patent/US20140142851A1",
        format: "raw",
        data_format: "markdown",
        country: "us",
      });
      assert.equal(result.markdown.length, 20_000);
      assert.equal(result.bytes, 20_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects non-public and non-HTTPS URLs before transport", async () => {
    const config = loadTingleConfig({
      TINGLE_UNLOCKER_ZONE: "unit-test-zone",
    } as NodeJS.ProcessEnv);
    await assert.rejects(
      fetchUnlockerMarkdown(config, "javascript:alert('no')"),
      /public HTTPS URL/,
    );
    await assert.rejects(
      fetchUnlockerMarkdown(config, "http://127.0.0.1/private"),
      /public HTTPS URL/,
    );
  });
});

const liveConfig = loadTingleConfig();
it(
  "live Unlocker fetch returns markdown",
  {
    skip:
      liveConfig.mock || !liveConfig.apiToken || !liveConfig.unlockerZone
        ? "requires BRIGHT_DATA_API_TOKEN and TINGLE_UNLOCKER_ZONE"
        : false,
  },
  async () => {
    const result = await fetchUnlockerMarkdown(
      liveConfig,
      "https://geo.brdtest.com/welcome.txt",
    );
    assert.equal("skipped" in result, false);
    if ("skipped" in result) return assert.fail(result.reason);
    assert.equal(result.status, 200);
    assert.ok(result.markdown.length > 0);
    assert.equal(result.bytes, Buffer.byteLength(result.markdown));
  },
);
