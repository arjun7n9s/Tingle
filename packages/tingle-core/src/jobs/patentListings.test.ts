import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTingleConfig } from "../config.js";
import { MOCK_UNLOCKER_LISTING_MARKDOWN } from "../bd/unlocker.js";
import {
  fetchPatentListings,
  isUnlockerHostBlock,
  parseGooglePatentsXhr,
  parsePatentListingMarkdown,
} from "./patentListings.js";

describe("parsePatentListingMarkdown", () => {
  it("keeps Google Patents cards from markdown and does not invent titles", () => {
    const rows = parsePatentListingMarkdown(MOCK_UNLOCKER_LISTING_MARKDOWN);
    assert.ok(rows.length >= 2);
    assert.equal(rows[0]?.title, "Haptic wearable alert");
    assert.match(rows[0]?.url ?? "", /\/patent\/US20140142851A1/);
    assert.equal(rows[0]?.collector, "patent");
  });

  it("keeps Espacenet cards from markdown", () => {
    const rows = parsePatentListingMarkdown(
      "[Speech masking canopy](https://worldwide.espacenet.com/patent/search/family/123?q=US2014)",
    );
    assert.equal(rows[0]?.title, "Speech masking canopy");
    assert.match(rows[0]?.url ?? "", /espacenet/);
  });
});

describe("parseGooglePatentsXhr", () => {
  it("keeps publication numbers from Google JSON and does not invent them", () => {
    const rows = parseGooglePatentsXhr({
      results: {
        cluster: [
          {
            result: [
              {
                patent: {
                  publication_number: "US20140142851A1",
                  title: "Haptic wearable alert",
                  snippet: "A glove that vibrates.",
                },
              },
            ],
          },
        ],
      },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.title, "Haptic wearable alert");
    assert.match(rows[0]?.url ?? "", /US20140142851A1/);
  });
});

describe("fetchPatentListings", () => {
  it("returns listing cards from Unlocker mock without fetching", async () => {
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
      const result = await fetchPatentListings(config, "haptic wearable");
      assert.equal(calls, 0);
      assert.ok(result.rows.length >= 1);
      assert.equal(result.skipped, undefined);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("skips when no Unlocker zone is set", async () => {
    const config = loadTingleConfig({ TINGLE_MOCK: "1" } as NodeJS.ProcessEnv);
    const result = await fetchPatentListings(config, "haptic wearable");
    assert.equal(result.rows.length, 0);
    assert.equal(result.skipped, "missing_unlocker_zone");
  });
});

describe("isUnlockerHostBlock", () => {
  it("detects the patents.google.com Unlocker refusal string", () => {
    assert.equal(isUnlockerHostBlock("this endpoint is not supported"), true);
    assert.equal(isUnlockerHostBlock(MOCK_UNLOCKER_LISTING_MARKDOWN), false);
  });
});
