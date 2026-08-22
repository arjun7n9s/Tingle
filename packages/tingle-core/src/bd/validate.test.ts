import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockBrokenChaos, mockGoodChaos } from "./mock.js";
import { buildHealPrompt, isValidationSuccess, validateRows } from "./validate.js";

describe("validateRows", () => {
  it("accepts the chaos fixture shape", () => {
    const result = validateRows("chaos", mockGoodChaos());
    assert.equal(isValidationSuccess(result), true);
    assert.equal(result.ok.length, 4);
  });

  it("treats empty required fields as a heal incident, not an empty niche", () => {
    const result = validateRows("chaos", mockBrokenChaos());
    assert.equal(isValidationSuccess(result), false);
    assert.equal(result.ok.length, 0);
    assert.ok(result.issues.some((i) => /title/i.test(i)));
  });

  it("treats an empty dataset as an incident", () => {
    const result = validateRows("watch", []);
    assert.ok(result.issues[0]?.includes("empty dataset"));
    assert.equal(result.ok.length, 0);
  });

  it("never returns invalid rows as ok", () => {
    const result = validateRows("search", [
      { title: "", url: "not-a-url", snippet: "" },
    ]);
    assert.equal(result.ok.length, 0);
    assert.ok(result.issues.length > 0);
  });

  it("names frozen fields in the heal prompt and stays under 1000 chars", () => {
    const prompt = buildHealPrompt("chaos", ["[0] title: empty title"]);
    assert.ok(prompt.includes("title"));
    assert.ok(prompt.includes("snippet"));
    assert.ok(prompt.length <= 1000);
  });
});
