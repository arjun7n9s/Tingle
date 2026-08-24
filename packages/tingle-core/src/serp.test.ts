import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTingleConfig } from "./config.js";
import { fetchSerp, serpWatchTargets } from "./serp.js";

describe("fetchSerp", () => {
  it("skips silently in mock and without a zone", async () => {
    const mock = loadTingleConfig({
      TINGLE_MOCK: "1",
      TINGLE_SERP_ZONE: "serp_google",
      BRIGHT_DATA_API_TOKEN: "tok",
    } as NodeJS.ProcessEnv);
    const skipped = await fetchSerp(mock, ["biodegradable fishing lure"]);
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.rows.length, 0);

    const noZone = loadTingleConfig({
      TINGLE_MOCK: "0",
      BRIGHT_DATA_API_TOKEN: "tok",
    } as NodeJS.ProcessEnv);
    const also = await fetchSerp(noZone, ["biodegradable fishing lure"]);
    assert.equal(also.skipped, true);
  });

  it("reuses extra-Watch filtering, never a fourth collector", () => {
    const urls = serpWatchTargets(
      [
        "https://www.uneed.best/tool/lure",
        "https://github.com/foo/bar",
        "https://www.producthunt.com/posts/x",
      ],
      5,
    );
    assert.ok(urls.includes("https://www.uneed.best/tool/lure"));
    assert.ok(!urls.some((u) => /github|producthunt/i.test(u)));
  });
});
