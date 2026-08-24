import { z } from "zod";
import {
  isAmbientToken,
  isBroadSetting,
  isDistinctiveToken,
  isGenericTech,
  isStrongToken,
  tokens,
} from "./claim.js";
import type { LlmConfig } from "./llm.js";
import { completeJson } from "./llm.js";

export const ClaimGraphSchema = z.object({
  object: z.string().min(1),
  function: z.string().min(1),
  mechanism: z.string().min(1),
  setting: z.string(),
  queries: z.object({
    patents: z.array(z.string()).max(4),
    papers: z.array(z.string()).max(4),
    products: z.array(z.string()).max(4),
  }),
  must_concepts: z.array(z.string()).min(1).max(8),
  setting_terms: z.array(z.string()).max(8),
});

export type ClaimGraph = z.infer<typeof ClaimGraphSchema>;

const COMPILE_SYSTEM = [
  "Compile a product claim into structured search intent.",
  "Return JSON only, matching this shape:",
  '{ "object": string, "function": string, "mechanism": string, "setting": string,',
  '  "queries": { "patents": string[], "papers": string[], "products": string[] },',
  '  "must_concepts": string[], "setting_terms": string[] }',
  "object = what is built. function = what it does. mechanism = how. setting = where/context.",
  "setting_terms are ambient/scene words and MUST never be enough to match a hit.",
  "must_concepts are the invention (object, function, mechanism). Generic nouns like robots MAY appear if they are the object.",
  "queries: at most 4 short search strings per bucket. No company names you invented. No TAM.",
].join(" ");

export function fallbackCompile(claim: string): ClaimGraph {
  const toks = tokens(claim);
  const setting_terms = uniq(toks.filter(isAmbientToken)).slice(0, 8);
  const strong = toks.filter((t) => isStrongToken(t) && !isAmbientToken(t));
  const distinctive = strong.filter(
    (t) => isDistinctiveToken(t) && !isBroadSetting(t),
  );
  const generic = strong.filter(isGenericTech);

  const bigrams: string[] = [];
  for (let i = 0; i < toks.length - 1; i++) {
    const a = toks[i] ?? "";
    const b = toks[i + 1] ?? "";
    if (!isStrongToken(a) || !isStrongToken(b)) continue;
    if (isAmbientToken(a) || isAmbientToken(b)) continue;
    bigrams.push(`${a} ${b}`);
  }

  const must: string[] = [];
  pushAll(must, distinctive, 8);
  for (const g of generic) {
    const inBigram = bigrams.some((bg) => bg.split(/\s+/).includes(g));
    if (inBigram || distinctive.length < 2) pushAll(must, [g], 8);
  }
  pushAll(must, bigrams, 8);
  if (!must.length) {
    pushAll(must, strong.slice(0, 3), 8);
  }
  if (!must.length) must.push(toks[0] || "claim");

  const object =
    distinctive[0] ||
    generic[0] ||
    strong[0] ||
    "thing";
  const mechanism =
    bigrams.find((b) => b.split(/\s+/).some(isDistinctiveToken)) ||
    distinctive.slice(1, 3).join(" ") ||
    object;
  const fn =
    bigrams[0] ||
    distinctive.slice(0, 2).join(" ") ||
    object;

  const qCore = must.filter((m) => m.length >= 4).slice(0, 3);
  const seed = qCore[0] || object;
  return ClaimGraphSchema.parse({
    object,
    function: fn,
    mechanism,
    setting: setting_terms.join(" "),
    queries: {
      patents: padQueries(qCore.map((c) => `${c} patent`), seed, "patent"),
      papers: padQueries(qCore.map((c) => `${c} paper`), seed, "research"),
      products: padQueries(qCore, seed, "product"),
    },
    must_concepts: must.slice(0, 8),
    setting_terms,
  });
}

export async function compileClaimGraph(
  claim: string,
  llm?: LlmConfig,
): Promise<ClaimGraph> {
  const fallback = fallbackCompile(claim);
  if (!llm || !claim.trim()) return fallback;
  const raw = await completeJson(
    llm,
    [
      { role: "system", content: COMPILE_SYSTEM },
      { role: "user", content: claim.slice(0, 1500) },
    ],
    { temperature: 0, timeoutMs: 15_000 },
  );
  const parsed = ClaimGraphSchema.safeParse(raw);
  if (!parsed.success) return fallback;
  const graph = parsed.data;
  if (!graph.must_concepts.length) return fallback;
  return {
    ...graph,
    setting_terms: uniq([...graph.setting_terms, ...fallback.setting_terms]).slice(0, 8),
    must_concepts: uniq([...graph.must_concepts, ...fallback.must_concepts]).slice(0, 8),
  };
}

export function flattenGraphQueries(graph: ClaimGraph, limit = 6): string[] {
  const out: string[] = [];
  for (const q of [
    ...graph.queries.products,
    ...graph.queries.patents,
    ...graph.queries.papers,
  ]) {
    const s = q.trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  if (!out.length) out.push(graph.object);
  return out;
}

function padQueries(list: string[], seed: string, suffix: string): string[] {
  const out = uniq(list.map((s) => s.trim()).filter(Boolean)).slice(0, 4);
  if (!out.length) out.push(`${seed} ${suffix}`.trim());
  return out.slice(0, 4);
}

function uniq(xs: string[]): string[] {
  const out: string[] = [];
  for (const x of xs) {
    const s = x.trim().toLowerCase();
    if (!s || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

function pushAll(into: string[], add: string[], cap: number): void {
  for (const x of add) {
    const s = x.trim().toLowerCase();
    if (!s || into.includes(s)) continue;
    into.push(s);
    if (into.length >= cap) return;
  }
}
