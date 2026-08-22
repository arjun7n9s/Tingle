import { randomUUID } from "node:crypto";
import {
  fetchArxiv,
  fetchGithubRepo,
  fetchHackerNews,
  fetchUspto,
  type AdjunctResult,
} from "../adjuncts.js";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import {
  buildFingerprints,
  claimLock,
  keywordQuery,
  phraseQuery,
  proposeClaim,
} from "../claim.js";
import { planCollectors } from "../collectors.js";
import type { TingleConfig } from "../config.js";
import { buildPiles, enrichHit, type EnrichedHit, type PileResult } from "../piles.js";
import type { HealEvent } from "../schema/events.js";
import {
  ProjectInputSchema,
  WatchProfileSchema,
  type ProjectInput,
  type WatchProfile,
} from "../schema/profile.js";
import type { ProjectStore } from "../store.js";

export type FirstLookRequest = {
  project_id?: string;
  input: ProjectInput;
  /** The sentence the builder confirmed. Required to spend anything. */
  claim?: string;
  /**
   * Explicit go-ahead. Without it the job returns a proposed claim and stops.
   * Credits are never spent on a sentence nobody agreed to.
   */
  confirmed?: boolean;
  must_match?: string[];
  now?: Date;
  /**
   * Write the profile and baseline. Quick chat sets this false: it is a
   * throwaway look with no memory, and leaving a profile and baseline on disk
   * would make it a project in everything but name.
   */
  persist?: boolean;
};

export type SourceReport = {
  name: string;
  kind: "collector" | "adjunct";
  ok: boolean;
  rows: number;
  error?: string;
  /** True when an owned collector proposed a repair and is awaiting review. */
  awaiting_approval?: boolean;
};

export type FirstLookResponse =
  | {
      status: "needs_confirmation";
      proposed_claim: string;
      fingerprints: string[];
      /** Nothing was scraped and nothing was charged. */
      spent: { collector_runs: 0 };
      message: string;
    }
  | {
      status: "ok";
      project_id: string;
      claim: string;
      claim_lock: string;
      stage: ProjectInput["stage"];
      piles: PileResult["piles"];
      pile_counts: Record<string, number>;
      filtered: PileResult["filtered"];
      sources_used: string[];
      collectors_failed: SourceReport[];
      sources: SourceReport[];
      quality: PileResult["quality"] & {
        collectors_ok: number;
        collectors_total: number;
        adjuncts_ok: number;
        adjuncts_total: number;
      };
      heal_events: HealEvent[];
      baseline_size: number;
      spent: { collector_runs: number };
      profile: WatchProfile;
    };

/**
 * Claim in, three piles out. No UI, no chat, no model.
 *
 * The piles are a pure function of collector rows plus the claim's
 * fingerprints, so a hit that was not in the JSON cannot appear in a pile.
 * That is a property of the code path, not a instruction someone has to follow.
 */
export async function runFirstLook(
  config: TingleConfig,
  store: ProjectStore,
  req: FirstLookRequest,
): Promise<FirstLookResponse> {
  const now = req.now ?? new Date();
  const input = ProjectInputSchema.parse(req.input);

  // ── claim gate ───────────────────────────────────────────────────────────
  const claim = (req.claim ?? "").trim() || proposeClaim(input);
  if (!claim) {
    throw new Error(
      "nothing to build a claim from — supply a pitch, a doc, a link, a repo, or a patent number",
    );
  }
  const artifactText = [
    ...input.docs.map((d) => d.text),
    ...input.watch_list,
  ];
  const fp = buildFingerprints(claim, artifactText);

  if (!req.confirmed) {
    return {
      status: "needs_confirmation",
      proposed_claim: claim,
      fingerprints: fp.fingerprints.slice(0, 20),
      spent: { collector_runs: 0 },
      message:
        "Edit this into one sentence you would want watched, then send it back with confirmed: true. Nothing has been scraped and nothing has been charged.",
    };
  }

  const project_id = req.project_id ?? randomUUID();
  const lock = claimLock(claim);

  // ── owned collectors ─────────────────────────────────────────────────────
  const sources: SourceReport[] = [];
  const healEvents: HealEvent[] = [];
  const hits: EnrichedHit[] = [];
  let collectorRuns = 0;

  const client = new BrightDataClient(config);
  const { plans, skipped } = planCollectors(config, {
    claim,
    only: ["search", "watch"],
  });

  for (const s of skipped) {
    sources.push({
      name: s.key,
      kind: "collector",
      ok: false,
      rows: 0,
      error: s.reason,
    });
  }

  for (const plan of plans) {
    collectorRuns += 1;
    const outcome = await scrapeAndValidate(client, {
      collectorId: plan.collectorId,
      source: plan.source,
      inputs: plan.inputs,
      // Never auto-approve inside a user-facing job. A repair that reshapes
      // the schema gets looked at by a person first.
      autoApprove: false,
      onHealEvent: (e) => healEvents.push(e),
    });
    for (const row of outcome.hits) {
      hits.push(enrichHit(row, plan.key, now));
    }
    sources.push({
      name: plan.key,
      kind: "collector",
      ok: outcome.hits.length > 0 && !outcome.error,
      rows: outcome.hits.length,
      error: outcome.error,
      awaiting_approval: outcome.awaitingApproval || undefined,
    });
  }

  // ── adjuncts, clearly labelled, never the only path ──────────────────────
  // Keyword APIs get distinctive terms, not the claim sentence — see
  // keywordQuery. arXiv matches on an exact string, so it gets the best phrase.
  const kw = keywordQuery(fp);
  const phrase = phraseQuery(fp);
  const adjunctCalls: Array<Promise<AdjunctResult>> = [
    fetchHackerNews(kw),
    fetchArxiv(phrase),
    fetchUspto(kw, process.env.TINGLE_USPTO_API_KEY),
  ];
  if (input.github_repo) adjunctCalls.push(fetchGithubRepo(input.github_repo));

  for (const result of await Promise.all(adjunctCalls)) {
    for (const row of result.rows) {
      hits.push(enrichHit(row, `adjunct:${result.name}`, now));
    }
    sources.push({
      name: `adjunct:${result.name}`,
      kind: "adjunct",
      ok: result.ok,
      rows: result.rows.length,
      error: result.error,
    });
  }

  // ── piles ────────────────────────────────────────────────────────────────
  const result = buildPiles(hits, fp, {
    now,
    mustMatch: req.must_match ?? [],
    ignore: input.ignore,
  });

  // ── persist ──────────────────────────────────────────────────────────────
  const kept = [
    ...result.piles.stand_on_this,
    ...result.piles.already_in_the_lane,
    ...result.piles.shipped_last_7_days,
  ];
  const persist = req.persist ?? true;
  const entries = kept.map((h) => ({
    id: h.id,
    url: h.url,
    origin: h.origin,
    content_hash: h.content_hash,
  }));
  const baseline = persist
    ? await store.saveBaseline(project_id, lock, entries)
    : {
        project_id,
        claim_lock: lock,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        entries: entries.map((e) => ({ ...e, first_seen: now.toISOString() })),
      };

  const existing = persist ? await store.loadProfile(project_id) : null;
  const profile = WatchProfileSchema.parse({
    project_id,
    stage: input.stage,
    claim,
    claim_lock: lock,
    fingerprints: fp.fingerprints.slice(0, 40),
    must_match: req.must_match ?? [],
    ignore: input.ignore,
    sources: sources.filter((s) => s.ok).map((s) => s.name),
    baseline_ids: baseline.entries.map((e) => e.id),
    geo: { country: input.country ?? config.searchCountry },
    budget: {
      cap_page_loads: existing?.budget.cap_page_loads ?? 500,
      spent_page_loads: (existing?.budget.spent_page_loads ?? 0) + collectorRuns,
      lane: existing?.budget.lane ?? "cheap",
    },
    alert_email: existing?.alert_email ?? null,
    digest_floor: existing?.digest_floor ?? "weekly",
    stealth: existing?.stealth ?? false,
    storage: existing?.storage ?? "vault",
    created_at: existing?.created_at ?? now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (persist) await store.saveProfile(profile);

  const collectors = sources.filter((s) => s.kind === "collector");
  const adjuncts = sources.filter((s) => s.kind === "adjunct");

  return {
    status: "ok",
    project_id,
    claim,
    claim_lock: lock,
    stage: input.stage,
    piles: result.piles,
    pile_counts: {
      stand_on_this: result.piles.stand_on_this.length,
      already_in_the_lane: result.piles.already_in_the_lane.length,
      shipped_last_7_days: result.piles.shipped_last_7_days.length,
    },
    filtered: result.filtered,
    sources_used: sources.filter((s) => s.ok).map((s) => s.name),
    collectors_failed: collectors.filter((s) => !s.ok),
    sources,
    quality: {
      ...result.quality,
      collectors_ok: collectors.filter((s) => s.ok).length,
      collectors_total: collectors.length,
      adjuncts_ok: adjuncts.filter((s) => s.ok).length,
      adjuncts_total: adjuncts.length,
    },
    heal_events: healEvents,
    baseline_size: baseline.entries.length,
    spent: { collector_runs: collectorRuns },
    profile,
  };
}
