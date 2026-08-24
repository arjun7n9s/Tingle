import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClaimRelevant,
  proposeClaim,
  scoreAgainstClaim,
  titleFromClaim,
} from "./claim.js";
import { adjunctSearchQuery, adjunctSearchQueries } from "./adjunct.js";

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

  it("keeps later-sentence tokens as fingerprints so ranking sees the whole pitch", () => {
    const p = proposeClaim({
      pitch:
        "I wanna make haptic navigation gloves, for riders. When I take a right turn the right hand vibrates.",
    });
    assert.match(p.claim.toLowerCase(), /haptic navigation gloves/);
    assert.doesNotMatch(p.claim.toLowerCase(), /vibrates/);
    assert.ok(p.fingerprints.includes("vibrates"));
    assert.ok(p.fingerprints.includes("haptic"));
    assert.ok(p.fingerprints.includes("glove"));
    assert.equal(
      adjunctSearchQuery(p.claim, p.fingerprints),
      "haptic navigation",
    );
  });

  it("does not ellipsis-truncate a long one-sentence pitch", () => {
    const pitch =
      "Unlike standard active noise-canceling headphones that block all sound or basic white-noise machines that play a static hiss, this system uses ambient IoT sensors and directional micro-speakers embedded in individual desk canopies to generate a localized psychoacoustic masking sound tuned to human speech.";
    const p = proposeClaim({ pitch });
    assert.doesNotMatch(p.claim, /…|\.\.\./);
    assert.match(p.claim.toLowerCase(), /psychoacoustic/);
    assert.match(p.claim.toLowerCase(), /desk canopies/);
  });

  it("rebuilds from the pitch when a stored claim was ellipsis-cut", () => {
    const pitch =
      "Unlike standard active noise-canceling headphones that block all sound, this system uses ambient IoT sensors and directional micro-speakers in desk canopies to generate a localized psychoacoustic masking sound.";
    const p = proposeClaim({
      pitch,
      claim:
        "This system uses ambient IoT sensors and directional micro-speakers in desk canopies to analyze and manage nearby sounds, distinguishing between general murmurs, sharp noises, and human speech to reduce cognitive dist…",
    });
    assert.doesNotMatch(p.claim, /…|\.\.\./);
    assert.match(p.claim.toLowerCase(), /psychoacoustic|desk canopies/);
  });
});

describe("titleFromClaim", () => {
  it("names a messy pitch, not the whole paragraph", () => {
    assert.equal(
      titleFromClaim(
        "I wanna make haptic navigation gloves, Key problem is : Mobile is Visual distraction for bike riders",
      ),
      "Haptic navigation gloves",
    );
  });

  it("shortens the sample watch claim", () => {
    assert.equal(
      titleFromClaim(
        "a watch that tells indie builders when someone else ships their idea",
      ),
      "Watch that tells indie builders",
    );
  });

  it("does not invent a name from an empty claim", () => {
    assert.equal(titleFromClaim("   "), "Untitled");
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

  it("does not treat glue verbs as a match for a haptic vest claim", () => {
    const { fingerprints } = proposeClaim({
      claim:
        "I want to create a vest that uses haptics to help guide blind people with navigation",
    });
    assert.equal(
      adjunctSearchQuery(
        "I want to create a vest that uses haptics to help guide blind people with navigation",
        fingerprints,
      ),
      "navigation haptics",
    );
    assert.equal(
      isClaimRelevant(
        {
          title:
            "10 simple rules to create a serious game, illustrated with examples from structural biology",
          snippet: "How to create and use games that help people learn.",
          url: "http://arxiv.org/abs/1708.04176v2",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "Ask HN: When to establish an LLC or S-corp for a 1-person startup?",
          snippet: "When should a founder create a company to help people invest?",
          url: "https://news.ycombinator.com/item?id=15909737",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "A haptic vest for indoor navigation of blind pedestrians",
          snippet: "Vibrotactile cues on the torso guide walking without a screen.",
          url: "https://arxiv.org/abs/0000.11111",
        },
        fingerprints,
      ),
      true,
    );
  });

  it("does not treat instruction/before glue as a match for a planter claim", () => {
    const { claim, fingerprints } = proposeClaim({
      claim:
        "A smart, self-watering indoor planter that uses AI to analyze your plant's leaves and text you exact care instructions before it wilts.",
    });
    assert.match(adjunctSearchQuery(claim, fingerprints), /planter|watering indoor/);
    assert.equal(
      isClaimRelevant(
        {
          title: "Show HN: Video2docs – Turn Screen Recordings into Step-by-Step Instructions",
          snippet: "Turn a recording into instructions before you ship.",
          url: "https://video2docs.com/",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "Army Helicopter Might Have Missed Critical Instruction Before Midair Crash",
          snippet: "The crew missed a critical instruction before the turn.",
          url: "https://www.nytimes.com/2025/02/14/us/politics/ntsb-potomac-crash.html",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "Self-Instruct: Aligning Language Models with Self-Generated Instructions",
          snippet: "Automatic instruction generation for language models.",
          url: "http://arxiv.org/abs/2212.10560v2",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "A self-watering indoor planter that reads leaf wilt and texts care steps",
          snippet: "Camera on the pot watches plant leaves and messages watering tips.",
          url: "https://example.com/leaf-planter",
        },
        fingerprints,
      ),
      true,
    );
  });

  it("does not treat autonomous/testing glue as a match for a hull UT rover", () => {
    const { claim, fingerprints } = proposeClaim({
      claim:
        "I'm making an autonomous ultrasonic testing rover which goes onto ship hulls and inspect the thickness ultrasonically point to point generating a c_scan wirelessly for defect information",
    });
    const query = adjunctSearchQuery(claim, fingerprints);
    assert.doesNotMatch(query, /autonomous/);
    assert.match(query, /hull|ultrasonic|thickness|rover|defect|scan/i);
    const queries = adjunctSearchQueries(claim, fingerprints, 2);
    assert.ok(queries.every((q) => !/autonomous/.test(q)));
    assert.equal(
      isClaimRelevant(
        {
          title:
            "Musk says Tesla close to developing fully autonomous car",
          snippet: "Tesla is developing autonomous vehicles.",
          url: "https://news.yahoo.com/musk-says-tesla-close-developing-fully-autonomous-car-115854000.html",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title:
            "Intersection focused Situation Coverage-based Verification and Validation Framework for Autonomous Vehicles Implemented in CARLA",
          snippet: "Coverage-based testing of autonomous vehicles in CARLA.",
          url: "http://arxiv.org/abs/2112.14706v2",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title:
            "Ultrasonic crawler for thickness mapping of ship hull plates",
          snippet:
            "A magnetic rover takes point-to-point ultrasonic C-scan readings on steel hulls.",
          url: "https://arxiv.org/abs/0000.22222",
        },
        fingerprints,
      ),
      true,
    );
  });

  it("does not treat cryogenic refrigerator papers as a kitchen smart-mirror claim", () => {
    const { claim, fingerprints } = proposeClaim({
      claim:
        "A smart mirror for your refrigerator that projects recipes directly onto the glass door using only the ingredients it senses inside, reducing food waste by alerting you when items are about to expire.",
    });
    const query = adjunctSearchQuery(claim, fingerprints);
    assert.doesNotMatch(query, /project/);
    assert.match(query, /mirror|recipe|ingredient|glass|expire/i);
    assert.equal(
      isClaimRelevant(
        {
          title: "A Continuous 100-mK Helium-Light Cooling System for MUSCAT on the LMT",
          snippet: "Cryogenic refrigerator project for a millikelvin receiver.",
          url: "http://arxiv.org/abs/1801.07442v2",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "Solenoid from experimental HTS tape for magnetic refrigeration",
          snippet: "A refrigerator project using superconducting tape.",
          url: "http://arxiv.org/abs/1902.09789v1",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "Smart Refrigerator using Internet of Things and Android",
          snippet: "IoT fridge monitors food items from a phone app.",
          url: "http://arxiv.org/abs/2012.10422v1",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "Recipe projection on a refrigerator glass door from sensed ingredients",
          snippet:
            "A smart mirror on the fridge door projects recipes from inside ingredients and expiry alerts.",
          url: "https://arxiv.org/abs/0000.33333",
        },
        fingerprints,
      ),
      true,
    );
  });

  it("does not treat dangerous-speech or lone-UAV papers as a collaborative robot claim", () => {
    const { claim, fingerprints } = proposeClaim({
      claim:
        "Small autonomous robots that work collaboratively in dangerous environments",
    });
    const query = adjunctSearchQuery(claim, fingerprints);
    assert.match(query, /robot/i);
    assert.doesNotMatch(query, /dangerous environment/i);
    assert.equal(
      isClaimRelevant(
        {
          title: "Understanding and Detecting Dangerous Speech in Social Media",
          snippet: "Dangerous speech in online environments.",
          url: "http://arxiv.org/abs/2101.00001",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "SELECTIVE ATTENTION AND PERFORMANCE IN DANGEROUS ENVIRONMENTS",
          snippet: "Human attention in dangerous environments.",
          url: "https://openalex.org/W123",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "UAV online path planning algorithm in a low altitude dangerous environment",
          snippet: "Single UAV path planning in a dangerous environment.",
          url: "https://openalex.org/W456",
        },
        fingerprints,
      ),
      false,
    );
    assert.equal(
      isClaimRelevant(
        {
          title: "A swarm of small mobile robots cooperating in collapsed buildings",
          snippet:
            "Collaborative multi-robot mapping in hazardous industrial sites.",
          url: "https://arxiv.org/abs/0000.44444",
        },
        fingerprints,
      ),
      true,
    );
  });
});
