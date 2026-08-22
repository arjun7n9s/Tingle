import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClaimRelevant,
  proposeClaim,
  scoreAgainstClaim,
} from "./claim.js";

describe("proposeClaim", () => {
  it("collapses pitch to one sentence and does not invent a product", () => {
    const p = proposeClaim({
      pitch:
        "a watch that tells indie builders when someone else ships their idea. Also TAM is huge.",
    });
    assert.match(p.claim.toLowerCase(), /indie builders/);
    assert.doesNotMatch(p.claim.toLowerCase(), /tam/);
    assert.ok(p.fingerprints.includes("indie builders"));
  });
});

describe("isClaimRelevant", () => {
  const fps = proposeClaim({
    claim: "a watch that tells indie builders when someone else ships their idea",
  }).fingerprints;

  it("keeps a listing row that overlaps the claim", () => {
    assert.equal(
      isClaimRelevant(
        {
          title: "I built a claim watch that pings me when someone ships my idea",
          snippet: "indie builders, public web, launch boards",
          url: "https://dev.to/example/claim-watch",
        },
        fps,
      ),
      true,
    );
  });

  it("drops unrelated listing noise", () => {
    assert.equal(
      isClaimRelevant(
        {
          title: "How I roast coffee beans in a studio apartment",
          snippet: "grind size and a $20 popper",
          url: "https://dev.to/example/coffee",
        },
        fps,
      ),
      false,
    );
  });

  it("honors ignore", () => {
    assert.equal(
      isClaimRelevant(
        {
          title: "indie builders shipping idea watches",
          snippet: "wikipedia disambiguation",
          url: "https://en.wikipedia.org/wiki/Watch",
        },
        fps,
        [],
        ["wikipedia"],
      ),
      false,
    );
  });

  it("scores distinctive phrases higher than stopwords", () => {
    const { score } = scoreAgainstClaim(
      "indie builders ships idea",
      fps,
    );
    assert.ok(score >= 2);
  });
});
