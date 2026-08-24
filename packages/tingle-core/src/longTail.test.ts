import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extraWatchUrls, isBlockedMarketplaceHost } from "./longTail.js";

describe("longTail extra watch URLs", () => {
  it("rejects pre-built marketplace hosts", () => {
    assert.equal(isBlockedMarketplaceHost("github.com"), true);
    assert.equal(isBlockedMarketplaceHost("reddit.com"), true);
    assert.equal(isBlockedMarketplaceHost("producthunt.com"), true);
    const d = extraWatchUrls([
      "https://github.com/foo/bar",
      "https://www.reddit.com/r/foo",
      "https://www.uneed.best/tool/x",
    ]);
    assert.equal(d.accepted.includes("https://www.uneed.best/tool/x"), true);
    assert.ok(d.rejected.some((r) => /github/i.test(r.reason) || /github/i.test(r.url)));
    assert.ok(d.rejected.some((r) => /reddit/i.test(r.url)));
  });

  it("ignores non-URL watch-list names", () => {
    const d = extraWatchUrls(["LanePing", "not a url"]);
    assert.deepEqual(d.accepted, []);
    assert.deepEqual(d.rejected, []);
  });
});
