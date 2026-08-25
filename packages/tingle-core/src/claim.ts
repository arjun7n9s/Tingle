import type { HitRow } from "./schema/hits.js";

const STOP = new Set(
  [
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "to",
    "for",
    "in",
    "on",
    "at",
    "is",
    "are",
    "was",
    "be",
    "by",
    "it",
    "its",
    "as",
    "that",
    "this",
    "with",
    "from",
    "into",
    "about",
    "when",
    "who",
    "what",
    "which",
    "their",
    "they",
    "them",
    "you",
    "your",
    "someone",
    "else",
    "thing",
    "things",
    "using",
    "used",
    "just",
    "than",
    "then",
    "also",
    "can",
    "will",
    "our",
    "my",
    "we",
    "i",
  ].map((w) => w.toLowerCase()),
);

export type ProposedClaim = {
  claim: string;
  fingerprints: string[];
  must_match: string[];
};

/**
 * Deterministic rewrite — no model. First sentence of pitch/docs, collapsed.
 * Credits are not spent until the caller sends this sentence back confirmed.
 */
export function looksTruncatedClaim(claim: string): boolean {
  return /…|\.{3}\s*$/.test(claim.trim());
}

export function proposeClaim(input: {
  pitch?: string;
  docs_text?: string;
  claim?: string;
}): ProposedClaim {
  const stored =
    input.claim && !looksTruncatedClaim(input.claim) ? input.claim : "";
  const claim = rewriteToSentence(
    stored || firstSentence(input.pitch) || firstSentence(input.docs_text) || input.claim || "",
  );
  const fingerprints = buildFingerprints(
    claim,
    [input.pitch, input.docs_text].filter(Boolean).join(" "),
  );
  return {
    claim,
    fingerprints,
    must_match: fingerprints.filter((fp) => {
      const parts = fp.split(/\s+/);
      return (
        parts.length === 2 &&
        parts.every(isStrongToken) &&
        parts.some(isDistinctiveToken)
      );
    }),
  };
}

export function rewriteToSentence(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim().replace(/…+/g, "");
  if (!collapsed) return "";
  const cut = collapsed.split(/(?<=[.!?])\s+/)[0] ?? collapsed;
  return cut.replace(/[.!?]+$/, "").trim();
}

/**
 * Short phrases for SERP / Unlocker patent search. Distinctive tokens only —
 * never a filing number the pitch did not contain.
 */
export function searchPhrasesFromClaim(claim: string): string[] {
  const distinctive = tokens(claim).filter(isDistinctiveToken);
  if (distinctive.length >= 2) return [distinctive.slice(0, 6).join(" ")];
  const words = claim.replace(/\s+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length ? [words.slice(0, 8).join(" ")] : [];
}

/**
 * Short file-name for a project. The claim stays the watch sentence;
 * the title is what the desk lists.
 */
export function titleFromClaim(claim: string): string {
  let s = claim.replace(/\s+/g, " ").trim();
  if (!s) return "Untitled";
  s = s.split(/\s*(?:,\s*)?(?:key problem|the problem|problem is)\b\s*:?\s*/i)[0] ?? s;
  s = s.replace(
    /^(?:i\s+(?:wanna|want to|wanted to|am going to|gonna)|i['’]?m|we(?:'re| are)|let'?s)\s+(?:make|build|create|ship|launch)\s+/i,
    "",
  );
  s = s.replace(/^(?:i\s+(?:wanna|want to)|i['’]?m|we(?:'re| are))\s+/i, "");
  s = s.replace(/^(?:a|an|the)\s+/i, "");
  s = (s.split(/[.!?]/)[0] ?? s).split(",")[0]?.trim() ?? s;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 5) s = words.slice(0, 5).join(" ");
  if (!s) return "Untitled";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function firstSentence(text?: string): string {
  if (!text?.trim()) return "";
  const line = text
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return line ?? "";
}

export function buildFingerprints(claim: string, extraText?: string): string[] {
  const bag = new Set<string>();
  for (const token of tokens(`${claim} ${extraText ?? ""}`)) {
    if (!isStrongToken(token)) continue;
    bag.add(token);
    if (token.length >= 5 && token.endsWith("s")) {
      const stem = token.slice(0, -1);
      if (isDistinctiveToken(stem)) bag.add(stem);
    }
  }
  const words = tokens(claim).filter((w) => w.length >= 3);
  for (let i = 0; i < words.length - 1; i++) {
    if (!isStrongToken(words[i]) || !isStrongToken(words[i + 1])) continue;
    bag.add(`${words[i]} ${words[i + 1]}`);
  }
  return [...bag];
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9+]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Verbs/glue that appear in almost every pitch. Matching only these is not a hit. */
const WEAK_UNI = new Set(
  [
    "create",
    "creates",
    "created",
    "creating",
    "make",
    "makes",
    "making",
    "made",
    "help",
    "helps",
    "helped",
    "helping",
    "use",
    "uses",
    "used",
    "using",
    "want",
    "wanna",
    "wanted",
    "wanting",
    "people",
    "person",
    "persons",
    "guide",
    "guides",
    "guiding",
    "guided",
    "based",
    "would",
    "could",
    "should",
    "give",
    "given",
    "gives",
    "send",
    "sends",
    "sending",
    "sent",
    "text",
    "texts",
    "texting",
    "self",
    "auto",
    "smart",
    "exact",
    "exactly",
    "care",
    "cares",
    "caring",
    "before",
    "after",
    "during",
    "while",
    "without",
    "within",
    "between",
    "through",
    "instruction",
    "instructions",
    "instruct",
    "instructed",
    "analyze",
    "analysed",
    "analyzed",
    "analysis",
    "language",
    "model",
    "models",
    "learning",
    "generation",
    "ranking",
    "following",
    "natural",
    "human",
    "automatic",
    "automatically",
    "system",
    "systems",
    "method",
    "methods",
    "approach",
    "result",
    "results",
    "paper",
    "papers",
    "product",
    "products",
    "tool",
    "tools",
    "user",
    "users",
    "data",
    "problem",
    "key",
    "just",
    "really",
    "basically",
    "need",
    "needs",
    "needed",
    "work",
    "works",
    "working",
    "look",
    "looks",
    "looking",
    "thing",
    "things",
    "someone",
    "something",
    "simple",
    "rules",
    "example",
    "examples",
    "small",
    "smaller",
    "smallest",
    "large",
    "larger",
    "largest",
    "tiny",
    "huge",
    "mini",
    "start",
    "starts",
    "starting",
    "great",
    "good",
    "best",
    "new",
    "way",
    "ways",
    "like",
    "also",
    "idea",
    "ideas",
    "software",
    "softwares",
    "build",
    "builds",
    "building",
    "built",
    "show",
    "shows",
    "turn",
    "turns",
    "step",
    "steps",
    "related",
    "using",
    "into",
    "over",
    "from",
    "with",
    "your",
    "their",
  ].map((w) => w.toLowerCase()),
);

/**
 * Setting and quality words. They describe a scene ("dangerous environment")
 * not the invention. Matching only these is how "dangerous speech" lands on
 * a robot-swarm claim.
 */
const AMBIENT_UNI = new Set(
  [
    "dangerous",
    "danger",
    "environment",
    "environments",
    "environmental",
    "hazardous",
    "hazard",
    "hazards",
    "efficient",
    "efficiently",
    "efficiency",
    "complete",
    "completely",
    "complex",
    "reliable",
    "reliability",
    "situation",
    "situations",
    "performance",
    "public",
    "social",
    "speech",
    "media",
    "twitter",
    "captioning",
    "incitement",
    "london",
    "absenteeism",
    "accident",
    "accidents",
    "crime",
    "residential",
    "attention",
    "network",
    "networks",
    "tomography",
    "hashing",
    "broadcast",
    "bittorrent",
  ].map((w) => w.toLowerCase()),
);

/**
 * Industry-generic nouns. Fine inside a bigram ("ultrasonic testing") but
 * never enough on their own — otherwise every "autonomous vehicle" story
 * matches an ultrasonic hull rover.
 */
const GENERIC_TECH = new Set(
  [
    "autonomous",
    "autonomously",
    "automation",
    "testing",
    "tested",
    "tester",
    "inspect",
    "inspection",
    "inspecting",
    "developing",
    "development",
    "develop",
    "developer",
    "generate",
    "generating",
    "generated",
    "information",
    "wireless",
    "wirelessly",
    "related",
    "existing",
    "research",
    "vehicle",
    "vehicles",
    "vehicular",
    "robotic",
    "robot",
    "robots",
    "machine",
    "machines",
    "framework",
    "verification",
    "validation",
    "coverage",
    "implemented",
    "industry",
    "commercial",
    "available",
    "based",
    "approach",
    "proposed",
    "novel",
    "onto",
    "across",
    "during",
    "point",
    "points",
    "goes",
    "going",
    "gone",
    "come",
    "comes",
    "public",
    "page",
    "pages",
    "website",
    "application",
    "applications",
    "platform",
    "platforms",
    "control",
    "controlled",
    "detection",
    "connected",
    "intelligent",
    "realtime",
    "mixed",
    "traffic",
    "situation",
    "intersection",
    "project",
    "projects",
    "projected",
    "projecting",
    "food",
    "foods",
    "item",
    "items",
    "android",
    "internet",
    "things",
    "cooling",
    "thermal",
    "magnetic",
    "comparison",
    "experimental",
    "performance",
    "international",
    "journal",
    "continuous",
    "reducing",
    "alerting",
    "directly",
    "inside",
    "software",
    "codebase",
    "agent",
    "agents",
    "claude",
    "terminal",
    "terminals",
    "parallel",
    "repository",
    "startup",
  ].map((w) => w.toLowerCase()),
);

/**
 * Common host objects. Matching only these (fridge, car, phone) is not
 * the claim — cryogenic "refrigerator" papers are not a kitchen product.
 */
const BROAD_SETTING = new Set(
  [
    "refrigerator",
    "fridge",
    "freezer",
    "oven",
    "stove",
    "microwave",
    "dishwasher",
    "washer",
    "dryer",
    "vehicle",
    "vehicles",
    "car",
    "cars",
    "truck",
    "phone",
    "phones",
    "computer",
    "computers",
    "laptop",
    "camera",
    "cameras",
    "sensor",
    "sensors",
    "door",
    "doors",
    "kitchen",
    "household",
    "home",
  ].map((w) => w.toLowerCase()),
);

const PHYSICS_NOISE =
  /\b(quantum|helium|millikelvin|\bmk\b|superconduct(?:ing|or)?|thermionic|thermoelectric|cryogen(?:ic|ics)?|cavity\s+qed|coulomb|dilution refrigerator|magnetic refrigeration|hts(?:\s+tape)?|solenoid)\b/i;

export function isStrongToken(token: string): boolean {
  const t = token.toLowerCase();
  return t.length >= 4 && !WEAK_UNI.has(t);
}

export function isAmbientToken(token: string): boolean {
  const t = token.toLowerCase();
  return AMBIENT_UNI.has(t) || AMBIENT_UNI.has(stemToken(t));
}

export function isDistinctiveToken(token: string): boolean {
  const t = token.toLowerCase();
  return isStrongToken(t) && !isGenericTech(t) && !isAmbientToken(t);
}

export function isGenericTech(token: string): boolean {
  const t = token.toLowerCase();
  return GENERIC_TECH.has(t) || GENERIC_TECH.has(stemToken(t));
}

export function isBroadSetting(token: string): boolean {
  return BROAD_SETTING.has(token.toLowerCase());
}

/** Distinctive nouns that are not just the host appliance. */
export function claimAnchorTokens(fingerprints: string[]): string[] {
  return [
    ...new Set(
      fingerprints
        .flatMap((fp) => fp.split(/\s+/))
        .filter((t) => isDistinctiveToken(t) && !isBroadSetting(t)),
    ),
  ];
}

/**
 * A fingerprint is evidence only if it is not a setting-only phrase.
 * Generic-tech unigrams ("robots") may count — they can be the object.
 * Host/role lists are not the matcher.
 */
export function isContentFingerprint(fp: string): boolean {
  const parts = fp.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length || parts.every(isAmbientToken)) return false;
  if (parts.length >= 2) {
    return parts.some(isDistinctiveToken);
  }
  const one = parts[0] ?? "";
  if (isBroadSetting(one) && !isGenericTech(one)) return false;
  return isDistinctiveToken(one) || isGenericTech(one);
}

export type MatchScore = {
  score: number;
  matched: string[];
};

/**
 * Listing pages (DEV tag, Uneed homepage) are not keyword search. We rank
 * extracted rows against the confirmed claim here.
 */
export function containsPhrase(hay: string, needle: string): boolean {
  const escaped = needle
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(hay);
}

/** Light English stem so collaboratively ≈ collaborative, robots ≈ robot. */
export function stemToken(token: string): string {
  const t = token.toLowerCase();
  if (t.length >= 8 && t.endsWith("ly")) return t.slice(0, -2);
  if (t.length >= 7 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length >= 6 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length >= 5 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length >= 5 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function conceptHits(hay: string, concept: string): boolean {
  if (containsPhrase(hay, concept)) return true;
  const parts = concept.toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const stem = stemToken(parts[0] ?? "");
    if (stem.length >= 4 && stem !== parts[0] && containsPhrase(hay, stem)) {
      return true;
    }
  }
  return false;
}

export function scoreAgainstClaim(
  text: string,
  fingerprints: string[],
  mustMatch: string[] = [],
): MatchScore {
  const hay = text.toLowerCase();
  const matched: string[] = [];
  let score = 0;
  for (const fp of fingerprints) {
    if (fp.length < 3) continue;
    if (conceptHits(hay, fp)) {
      matched.push(fp);
      score += fp.includes(" ") ? 3 : 1;
    }
  }
  for (const must of mustMatch) {
    if (!must || matched.includes(must)) continue;
    if (conceptHits(hay, must)) {
      matched.push(must);
      score += 3;
    }
  }
  return { score, matched };
}

/**
 * Precision over recall. Empty piles beat a wrong row.
 * Setting words ("dangerous environment") never identify the invention.
 * Host/role inventories are not a gate — matching uses distinctive
 * tokens, strong bigrams, and generic-tech *objects* from the claim.
 */
export function isClaimRelevant(
  hit: Pick<HitRow, "title" | "snippet" | "url">,
  fingerprints: string[],
  mustMatch: string[] = [],
  ignore: string[] = [],
): boolean {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`;
  if (ignore.some((g) => g && conceptHits(blob, g))) {
    return false;
  }
  if (PHYSICS_NOISE.test(blob) && !fingerprints.some((fp) => PHYSICS_NOISE.test(fp))) {
    return false;
  }

  const settingHits: string[] = [];
  const mustHits: string[] = [];
  const bag = [...fingerprints, ...mustMatch];
  for (const fp of bag) {
    if (!fp || fp.length < 3) continue;
    if (!conceptHits(blob, fp)) continue;
    const parts = fp.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.every(isAmbientToken)) {
      settingHits.push(fp);
      continue;
    }
    if (!isContentFingerprint(fp)) continue;
    mustHits.push(fp);
  }
  if (!mustHits.length) return false;
  if (mustHits.every((m) => m.split(/\s+/).every(isAmbientToken))) return false;

  const distinctiveHits = mustHits.filter((m) =>
    m.split(/\s+/).some((p) => isDistinctiveToken(p) && !isBroadSetting(p)),
  );
  const genericHits = mustHits.filter(
    (m) =>
      !m.split(/\s+/).some(isDistinctiveToken) &&
      m.split(/\s+/).some(isGenericTech),
  );
  const claimHasDistinctive = bag.some(
    (fp) => isContentFingerprint(fp) && fp.split(/\s+/).some(isDistinctiveToken),
  );

  if (claimHasDistinctive && !distinctiveHits.length && !mustHits.some((m) => m.includes(" "))) {
    return false;
  }
  if (!distinctiveHits.length && genericHits.length && claimHasDistinctive) {
    return false;
  }
  if (mustHits.some((m) => m.includes(" ") && m.split(/\s+/).some(isDistinctiveToken))) {
    return true;
  }
  if (distinctiveHits.length >= 1) {
    if (distinctiveHits.some((m) => m.length >= 6)) return true;
    if (distinctiveHits.length >= 2) return true;
    if (genericHits.length) return true;
  }
  const dist = distinctiveHits.filter((m) => !m.includes(" "));
  return dist.length >= 2 && dist.some((m) => m.length >= 6);
}

export function parseGithubRepo(
  url: string,
): { owner: string; repo: string } | undefined {
  try {
    const u = new URL(url);
    if (!/github\.com$/i.test(u.hostname)) return undefined;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return undefined;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return undefined;
  }
}
