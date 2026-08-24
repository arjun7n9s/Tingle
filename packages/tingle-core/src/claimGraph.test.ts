import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isClaimRelevant, proposeClaim } from "./claim.js";
import { fallbackCompile } from "./claimGraph.js";
import { lexicalJudge } from "./relevance.js";

describe("fallbackCompile", () => {
  it("compiles a never-seen-before pitch without domain lists", () => {
    const graph = fallbackCompile(
      "biodegradable fishing lure that dissolves after 48h",
    );
    assert.match(graph.object, /lure|fishing|biodegradable/);
    assert.ok(
      graph.must_concepts.some((c) => /lure|biodegradable|dissolv/i.test(c)),
    );
    assert.ok(!graph.must_concepts.includes("robot"));
    assert.ok(!graph.must_concepts.includes("hull"));
    const blob = graph.must_concepts.join(" ");
    assert.match(blob, /lure|fishing|biodegradable/);
    assert.ok(graph.queries.products.length >= 1);
    assert.ok(graph.queries.patents.length >= 1);
  });
});

describe("robot claim without host lists", () => {
  const claim =
    "Small autonomous robots that work collaboratively in dangerous environments";
  const { fingerprints } = proposeClaim({ claim });
  const graph = fallbackCompile(claim);

  it("puts the object (robots) and a distinctive mechanism in must_concepts", () => {
    const blob = graph.must_concepts.join(" ");
    assert.match(blob, /robot/);
    assert.match(blob, /collaborat/);
    assert.ok(!graph.must_concepts.some((c) => /^dangerous$/.test(c)));
    assert.ok(graph.setting_terms.some((t) => /dangerous|environment/.test(t)));
  });

  it("rejects setting-only speech and lone UAV as not the invention", () => {
    const speech = {
      title: "Understanding and Detecting Dangerous Speech in Social Media",
      snippet: "Dangerous speech in online environments.",
      url: "http://arxiv.org/abs/2101.00001",
    };
    const uav = {
      title: "UAV online path planning algorithm in a low altitude dangerous environment",
      snippet: "Single UAV path planning in a dangerous environment.",
      url: "https://openalex.org/W456",
    };
    assert.equal(isClaimRelevant(speech, fingerprints), false);
    assert.equal(isClaimRelevant(uav, fingerprints), false);
    assert.equal(lexicalJudge(speech, graph), "setting_only");
    const uavLabel = lexicalJudge(uav, graph);
    assert.ok(uavLabel === "setting_only" || uavLabel === "unrelated");
  });

  it("keeps collaborative robots as related art", () => {
    const hit = {
      title: "A swarm of small mobile robots cooperating in collapsed buildings",
      snippet:
        "Collaborative multi-robot mapping in hazardous industrial sites.",
      url: "https://arxiv.org/abs/0000.44444",
    };
    assert.equal(isClaimRelevant(hit, fingerprints), true);
    const label = lexicalJudge(hit, graph);
    assert.ok(label === "same_invention" || label === "related_art");
  });
});
