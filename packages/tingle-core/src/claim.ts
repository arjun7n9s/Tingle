import { createHash } from "node:crypto";
import type { ProjectInput } from "./schema/profile.js";

/**
 * Words that carry no signal for matching. Kept deliberately short — an
 * aggressive stoplist strips the domain nouns that make a claim distinctive.
 */
const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","than","that","this","these",
  "those","is","are","was","were","be","been","being","am","do","does","did",
  "have","has","had","having","i","you","he","she","it","we","they","me","him",
  "her","us","them","my","your","his","its","our","their","of","to","in","on",
  "at","by","for","with","from","into","about","as","so","up","out","over",
  "not","no","can","will","would","should","could","may","might","must","just",
  "very","really","want","wants","wanted","need","needs","like","get","gets",
  "make","makes","build","building","built","thing","things","stuff","app",
  "tool","platform","product","startup","idea","project","people","user",
  "users","someone","something","anyone","when","where","who","what","which",
  "how","why","while","because","also","more","most","other","some","any",
  "all","each","own","same","too","only","else","ever","every",
  // Closed-class words long enough to survive the length filter but carrying no
  // domain signal. Without these, "halfway through" outranks "indie builders"
  // purely on character count.
  "through","throughout","around","across","toward","towards","within",
  "without","between","before","after","again","still","already","halfway",
  "instead","rather","maybe","perhaps","actually","basically","essentially",
  "using","used","uses","based","help","helps","helping","lets","allow",
  "allows","give","gives","tell","tells","know","knows","see","sees","find",
  "finds","keep","keeps","take","takes","come","comes","going","goes",
]);

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Propose a one-sentence claim from whatever they handed us.
 *
 * Deliberately mechanical: it takes their own first sentence rather than
 * writing prose for them. The confirm step is where the sentence becomes
 * correct, and a generated paraphrase would just be a thing to argue with.
 * Never invents subject matter that is not in the input.
 */
export function proposeClaim(input: ProjectInput): string {
  const sources = [
    input.pitch,
    input.docs[0]?.text,
    input.links[0],
    input.github_repo,
  ].filter((s): s is string => Boolean(s?.trim()));

  const raw = sources[0]?.trim() ?? "";
  if (!raw) return "";

  // First sentence, or the first ~30 words if there is no sentence break.
  const firstSentence = raw.split(/(?<=[.!?])\s+/)[0] ?? raw;
  const words = firstSentence.split(/\s+/);
  const clipped = words.length > 30 ? `${words.slice(0, 30).join(" ")}…` : firstSentence;
  return clipped.replace(/\s+/g, " ").trim();
}

/**
 * A claim is only a watch once it has been confirmed, and the lock is what
 * proves it. Editing the sentence changes this hash, which forces a deliberate
 * re-confirm rather than silently retargeting an existing job.
 */
export function claimLock(claim: string): string {
  return createHash("sha256").update(normalizeText(claim)).digest("hex").slice(0, 16);
}

export function isClaimLocked(claim: string, lock: string): boolean {
  return claimLock(claim) === lock;
}

/**
 * Two-word phrases that genuinely sit next to each other in the source text,
 * with both halves carrying signal. Preserves real compounds and refuses to
 * manufacture ones that only exist because stopwords were removed.
 */
export function adjacentPhrases(text: string): string[] {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i]!;
    const b = words[i + 1]!;
    if (a.length <= 2 || b.length <= 2) continue;
    if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
    out.push(`${a} ${b}`);
  }
  return [...new Set(out)];
}

/**
 * A query a search API will actually answer.
 *
 * Never pass the claim sentence straight through. A confirmed claim reads like
 * prose — "a watch that tells indie builders when a competitor ships the
 * feature they are halfway through building" — and every keyword engine treats
 * that as a conjunction of twenty terms and returns nothing. The distinctive
 * terms are the query; the sentence is for the human.
 */
export function keywordQuery(fp: Fingerprints, maxTerms = 4): string {
  return fp.terms.slice(0, maxTerms).join(" ");
}

/** The single most distinctive phrase, for APIs that match on exact strings. */
export function phraseQuery(fp: Fingerprints, maxTerms = 3): string {
  return fp.phrases[0] ?? keywordQuery(fp, maxTerms);
}

export type Fingerprints = {
  /** Phrases used for matching, longest-first. */
  fingerprints: string[];
  /** Two-word phrases — much higher precision than single tokens. */
  phrases: string[];
  terms: string[];
};

/**
 * Build matching phrases from the claim plus any artifact text.
 *
 * Bigrams first: "refund rate" or "self-healing scraper" identifies a niche in
 * a way that "scraper" alone never will. Single terms are kept but ranked
 * below, and scoring weights them accordingly.
 */
export function buildFingerprints(
  claim: string,
  extra: string[] = [],
): Fingerprints {
  const claimTerms = tokenize(claim);
  const extraTerms = extra.flatMap((s) => tokenize(s));

  // Bigrams come from the *original* word order, not from the filtered token
  // list. Pairing up post-filter tokens invents phrases that were never
  // adjacent — "indie builders" is a real niche marker, "builders else" is an
  // artefact of having deleted the words in between.
  const phrases = adjacentPhrases(claim);

  // Rank by how much a term narrows the search.
  //
  // Frequency alone is useless on a single sentence — every word occurs once,
  // so sorting by it just returns claim word order, and the query becomes the
  // first few words ("watch tells indie builders") rather than the specific
  // ones. So: repetition across the artifacts counts, appearing inside a real
  // phrase counts, and length breaks ties as a rough specificity proxy —
  // "competitor" narrows a search, "tells" does not.
  //
  // A proper inverse-document-frequency table would beat this. Worth revisiting
  // once there are enough real claims to build one from.
  const freq = new Map<string, number>();
  for (const t of [...claimTerms, ...extraTerms]) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const inPhrase = new Set(phrases.flatMap((p) => p.split(" ")));
  const weight = (t: string) =>
    (freq.get(t) ?? 0) * 2 + (inPhrase.has(t) ? 2 : 0) + Math.min(t.length, 12) / 4;

  const terms = [...new Set(claimTerms)].sort((a, b) => weight(b) - weight(a));

  // Rank phrases by their parts, so the most specific compound leads. Insertion
  // order would just hand back whichever phrase happened to appear first.
  const rankedPhrases = [...new Set(phrases)].sort((a, b) => {
    const w = (p: string) =>
      p.split(" ").reduce((sum, t) => sum + weight(t), 0);
    return w(b) - w(a);
  });

  return {
    fingerprints: [...new Set([...rankedPhrases, ...terms])],
    phrases: rankedPhrases,
    terms,
  };
}
