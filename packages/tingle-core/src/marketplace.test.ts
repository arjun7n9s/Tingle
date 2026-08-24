import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMarketplaceRecords } from "./marketplace.js";

describe("parseMarketplaceRecords", () => {
  it("turns AI Mode citations into labeled hits and does not invent URLs", () => {
    const rows = parseMarketplaceRecords("ai_mode_dataset", [
      {
        prompt: "a watch that tells indie builders when someone else ships their idea",
        answer: "Several launch boards exist.",
        citations: [
          {
            title: "Uneed daily launches",
            url: "https://www.uneed.best/",
          },
        ],
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.source, "ai_mode_dataset");
    assert.equal(rows[0]?.url, "https://www.uneed.best/");
    assert.equal(rows[0]?.source_domain, "uneed.best");
  });

  it("drops citation objects with no url rather than filling from the model", () => {
    const rows = parseMarketplaceRecords("chatgpt_dataset", [
      { answer: "I made this up", citations: [{ title: "ghost" }] },
    ]);
    assert.equal(rows.length, 0);
  });

  it("does not treat chatgpt.com itself as a competitor hit", () => {
    const rows = parseMarketplaceRecords("chatgpt_dataset", [
      {
        url: "https://chatgpt.com/",
        prompt: "who already shipped this",
        answer_text: "Several products exist.",
        citations: [],
      },
    ]);
    assert.equal(rows.length, 0);
  });

  it("reads ChatGPT search_sources when citations is empty", () => {
    const rows = parseMarketplaceRecords("chatgpt_dataset", [
      {
        answer_text: "Uneed is a launch board.",
        search_sources: [
          { title: "Uneed", url: "https://www.uneed.best/" },
        ],
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.url, "https://www.uneed.best/");
  });
});
