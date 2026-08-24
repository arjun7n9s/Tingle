import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTingleConfig } from "./config.js";
import { runPatentability } from "./jobs/patentability.js";

const config = loadTingleConfig({
  TINGLE_MOCK: "1",
  BRIGHT_DATA_API_TOKEN: "",
  BRIGHTDATA_API_KEY: "",
});

describe("runPatentability", () => {
  it("maps hull UT as mixed/crowded art and drops Tesla-style glue", async () => {
    const report = await runPatentability(
      {
        claim:
          "an autonomous ultrasonic testing rover which goes onto ship hulls and inspects thickness point to point generating a c-scan wirelessly for defect information",
      },
      { config },
    );
    assert.match(report.disclaimer, /not a legal opinion/i);
    assert.ok(report.angles.length >= 1);
    assert.ok(report.queries.every((q) => !/^autonomous$/i.test(q)));
    const blob = JSON.stringify(report);
    assert.doesNotMatch(blob, /Tesla|lane-keeping/i);
    assert.match(blob, /hull|ultrasonic|C-scan/i);
    assert.ok(report.closest_art.some((h) => /hull|ultrasonic|C-scan/i.test(h.title)));
    assert.ok(report.memo.includes(report.verdict_line));
    assert.match(report.memo, /not a patent grant/i);
  });

  it("does not call a thin scrape a patent grant", async () => {
    const report = await runPatentability(
      {
        claim:
          "a watch that tells indie builders when someone else ships their idea",
      },
      { config },
    );
    assert.notEqual(report.verdict_line.toLowerCase().includes("you can patent"), true);
    assert.match(report.disclaimer, /patent office decides/i);
  });
});
