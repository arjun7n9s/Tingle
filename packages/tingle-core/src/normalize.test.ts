import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsLlmNormalize, normalizeExtractorRow } from "./normalize.js";

describe("needsLlmNormalize", () => {
  it("does not call the model for a dead extractor", () => {
    assert.equal(needsLlmNormalize("", ""), false);
  });
  it("flags CJK titles and claim-blob snippets", () => {
    assert.equal(needsLlmNormalize("自律ロボット群", "危険な環境で協働"), true);
    assert.equal(
      needsLlmNormalize(
        "US8123456",
        "A system comprising a plurality of nodes wherein each node",
      ),
      true,
    );
    assert.equal(
      needsLlmNormalize("LanePing", "Tells indie builders when a rival ships."),
      false,
    );
  });
});

describe("normalizeExtractorRow", () => {
  it("never invents a title when the extractor left it blank", async () => {
    const { row } = await normalizeExtractorRow(
      "patent",
      {
        title: "",
        url: "https://patents.example/x",
        snippet: "A system comprising widgets wherein",
      },
      {
        collector: "patent_uspto",
        llm: {
          apiKey: "x",
          model: "nope",
          url: "http://127.0.0.1:9/none",
        },
      },
    );
    const r = row as { title: string; snippet: string };
    assert.equal(r.title, "");
  });
});
