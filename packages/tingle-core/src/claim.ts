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
export function proposeClaim(input: {
  pitch?: string;
  docs_text?: string;
  claim?: string;
}): ProposedClaim {
  const claim = rewriteToSentence(
    input.claim || firstSentence(input.pitch) || firstSentence(input.docs_text) || "",
  );
  const fingerprints = buildFingerprints(claim, input.docs_text);
  return {
    claim,
    fingerprints,
    must_match: fingerprints.filter((fp) => fp.includes(" ")),
  };
}

export function rewriteToSentence(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const cut = collapsed.split(/(?<=[.!?])\s+/)[0] ?? collapsed;
  const sentence = cut.length > 220 ? `${cut.slice(0, 217).trim()}…` : cut;
  return sentence.replace(/[.!?]+$/, "");
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
    if (token.length >= 4) bag.add(token);
  }
  const words = tokens(claim).filter((w) => w.length >= 3);
  for (let i = 0; i < words.length - 1; i++) {
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

export type MatchScore = {
  score: number;
  matched: string[];
};

/**
 * Listing pages (DEV tag, Uneed homepage) are not keyword search. We rank
 * extracted rows against the confirmed claim here.
 */
function containsPhrase(hay: string, needle: string): boolean {
  const escaped = needle
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i").test(hay);
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
    if (containsPhrase(hay, fp)) {
      matched.push(fp);
      score += fp.includes(" ") ? 3 : 1;
    }
  }
  for (const must of mustMatch) {
    if (!must || matched.includes(must)) continue;
    if (containsPhrase(hay, must)) {
      matched.push(must);
      score += 3;
    }
  }
  return { score, matched };
}

/** Precision over recall: a bigram, or at least two unigram hits. */
export function isClaimRelevant(
  hit: Pick<HitRow, "title" | "snippet" | "url">,
  fingerprints: string[],
  mustMatch: string[] = [],
  ignore: string[] = [],
): boolean {
  const blob = `${hit.title} ${hit.snippet} ${hit.url}`;
  if (ignore.some((g) => g && containsPhrase(blob, g))) {
    return false;
  }
  const { matched } = scoreAgainstClaim(blob, fingerprints, mustMatch);
  if (matched.some((m) => m.includes(" "))) return true;
  return matched.length >= 2;
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
