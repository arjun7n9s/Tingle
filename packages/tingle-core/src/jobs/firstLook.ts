import { randomUUID } from "node:crypto";
import { fetchAdjuncts } from "../adjunct.js";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import { proposeClaim } from "../claim.js";
import {
  loadTingleConfig,
  type TingleConfig,
} from "../config.js";
import { saveBaseline } from "./baseline.js";
import {
  mapHitsToPiles,
  pileCounts,
  type PileableHit,
  type Piles,
} from "../piles.js";
import type { HealEvent } from "../schema/events.js";
import {
  FirstLookTogglesSchema,
  StageSchema,
  WatchProfileSchema,
  type Stage,
  type WatchProfile,
} from "../schema/profile.js";

export type FirstLookRequest = {
  project_id?: string;
  stage?: Stage;
  extra_question?: string;
  confirmed?: boolean;
  claim?: string;
  pitch?: string;
  docs_text?: string;
  links?: string[];
  github_url?: string;
  watch_list?: string[];
  patent_number?: string;
  ignore?: string[];
  auto_approve_heal?: boolean;
  lanes?: Array<"search" | "watch">;
  include_adjuncts?: boolean;
  stealth?: boolean;
};

export type FirstLookNeedsConfirm = {
  status: "needs_confirm";
  proposed_claim: string;
  fingerprints: string[];
  must_match: string[];
};

export type FirstLookResult = {
  status: "ok";
  claim: string;
  fingerprints: string[];
  profile: WatchProfile;
  piles: Piles;
  sources_used: string[];
  collectors_failed: string[];
    quality: {
      hit_count_per_pile: Record<string, number>;
      collectors_returned: string[];
      zod_failures: string[];
      empty_shipped_pile: boolean;
      hits_scraped: number;
      hits_matched: number;
    };
  baseline: {
    project_id: string;
    at: string;
    hit_ids: string[];
    urls: string[];
    content_hashes: string[];
  };
  heal_events: HealEvent[];
  analyst_contract: string;
};

export const ANALYST_CONTRACT =
  "I only report what the scrapers returned for this project. I do not invent products, papers, or patents. If a source did not come back, I will say it did not come back.";

export function parseFirstLookRequest(raw: unknown): FirstLookRequest {
  const r = (raw ?? {}) as Record<string, unknown>;
  const toggles = FirstLookTogglesSchema.parse({
    pitch: r.pitch,
    docs_text: r.docs_text,
    links: r.links,
    github_url: r.github_url,
    watch_list: r.watch_list,
    patent_number: r.patent_number,
    ignore: r.ignore,
  });
  const stage = r.stage
    ? StageSchema.parse(r.stage)
    : undefined;
  const hasInput = Boolean(
    toggles.pitch ||
      toggles.docs_text ||
      (toggles.links && toggles.links.length) ||
      toggles.github_url ||
      toggles.patent_number ||
      r.claim,
  );
  if (!hasInput) {
    throw new Error(
      "first look needs at least one toggle: pitch, docs_text, links, github_url, patent_number, or claim",
    );
  }
  return {
    project_id: typeof r.project_id === "string" ? r.project_id : undefined,
    stage,
    extra_question:
      typeof r.extra_question === "string" ? r.extra_question : undefined,
    confirmed: Boolean(r.confirmed),
    claim: typeof r.claim === "string" ? r.claim : undefined,
    auto_approve_heal: Boolean(r.auto_approve_heal),
    lanes: Array.isArray(r.lanes)
      ? (r.lanes.filter((x) => x === "search" || x === "watch") as Array<
          "search" | "watch"
        >)
      : undefined,
    include_adjuncts: r.include_adjuncts === false ? false : undefined,
    stealth: Boolean(r.stealth),
    ...toggles,
  };
}

export async function firstLook(
  req: FirstLookRequest,
  deps: {
    config?: TingleConfig;
    client?: BrightDataClient;
  } = {},
): Promise<FirstLookNeedsConfirm | FirstLookResult> {
  const config = deps.config ?? loadTingleConfig();
  const proposed = proposeClaim({
    pitch: req.pitch,
    docs_text: req.docs_text,
    claim: req.claim,
  });
  if (!proposed.claim) {
    throw new Error("could not derive a claim sentence from the inputs");
  }
  if (!req.confirmed) {
    return {
      status: "needs_confirm",
      proposed_claim: proposed.claim,
      fingerprints: proposed.fingerprints,
      must_match: proposed.must_match,
    };
  }

  const fingerprints = [
    ...proposed.fingerprints,
    ...(req.watch_list ?? []).map((w) => w.toLowerCase()),
  ];
  const ignore = req.ignore ?? [];
  const projectId = req.project_id ?? randomUUID();
  const profile = WatchProfileSchema.parse({
    project_id: projectId,
    stage: req.stage ?? "starting",
    extra_question: req.extra_question,
    claim: proposed.claim,
    fingerprints,
    must_match: proposed.must_match,
    ignore,
    sources: ["search", "watch"],
    github_url: req.github_url,
    patent_number: req.patent_number,
    links: req.links ?? [],
    watch_list: req.watch_list ?? [],
    stealth: Boolean(req.stealth),
  });

  const client = deps.client ?? new BrightDataClient(config);
  const healEvents: HealEvent[] = [];
  const collectorsFailed: string[] = [];
  const collectorsReturned: string[] = [];
  const zodFailures: string[] = [];
  const hits: PileableHit[] = [];

  const scrapeOne = async (source: "search" | "watch") => {
    const outcome = await scrapeAndValidate(client, config, source, {
      autoApprove: req.auto_approve_heal,
    });
    healEvents.push(...outcome.healEvents);
    if (!outcome.stored_as_success) {
      collectorsFailed.push(
        `${source}: ${outcome.error ?? "validation failed — not stored as success"}`,
      );
      if (outcome.error) zodFailures.push(`${source}: ${outcome.error}`);
      return;
    }
    collectorsReturned.push(source);
    hits.push(...outcome.rows);
  };

  await Promise.all(
    (req.lanes?.length ? req.lanes : (["search", "watch"] as const)).map(scrapeOne),
  );

  const adjunct =
    req.include_adjuncts === false
      ? { rows: [], sources_used: [] as string[], collectors_failed: [] as string[] }
      : await fetchAdjuncts(config, {
          fingerprints,
          githubUrl: req.github_url,
          patentNumber: req.patent_number,
        });
  hits.push(...adjunct.rows);
  collectorsFailed.push(...adjunct.collectors_failed);

  const piles = mapHitsToPiles(hits, {
    fingerprints,
    must_match: proposed.must_match,
    ignore,
  });
  const allPileHits = [
    ...piles.stand_on_this,
    ...piles.already_in_the_lane,
    ...piles.shipped_last_7_days,
  ];
  const baseline = {
    project_id: projectId,
    at: new Date().toISOString(),
    hit_ids: allPileHits.map((h) => h.id),
    urls: allPileHits.map((h) => h.url),
    content_hashes: allPileHits.map((h) => h.content_hash),
  };
  await saveBaseline(baseline);

  return {
    status: "ok",
    claim: proposed.claim,
    fingerprints,
    profile,
    piles,
    sources_used: [...collectorsReturned, ...adjunct.sources_used],
    collectors_failed: collectorsFailed,
    quality: {
      hit_count_per_pile: pileCounts(piles),
      collectors_returned: collectorsReturned,
      zod_failures: zodFailures,
      empty_shipped_pile: piles.shipped_last_7_days.length === 0,
      hits_scraped: hits.length,
      hits_matched: allPileHits.length,
    },
    baseline,
    heal_events: healEvents,
    analyst_contract: ANALYST_CONTRACT,
  };
}
