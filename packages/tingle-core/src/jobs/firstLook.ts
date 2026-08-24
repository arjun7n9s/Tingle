import { randomUUID } from "node:crypto";
import { fetchAdjuncts } from "../adjunct.js";
import {
  compileClaimGraph,
  flattenGraphQueries,
  type ClaimGraph,
} from "../claimGraph.js";
import { extraWatchUrls } from "../longTail.js";
import { fetchMarketplaceAdjuncts } from "../marketplace.js";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import { proposeClaim } from "../claim.js";
import {
  loadTingleConfig,
  type TingleConfig,
} from "../config.js";
import { mergeSnapshots, saveBaseline } from "./baseline.js";
import {
  allPileHits,
  mergeHits,
  mapHitsToPiles,
  pileCounts,
  type PileableHit,
  type Piles,
} from "../piles.js";
import { planLanes } from "../collectors.js";
import { enrichPatentDetails } from "./patentDetails.js";
import { fetchPatentListings } from "./patentListings.js";
import {
  fetchPatentSerpDiscovery,
  fetchRegionalSerp,
} from "./serpDiscovery.js";
import { isPatentCard, scorePatentThreats } from "./claimCompare.js";
import type { HealEvent } from "../schema/events.js";
import { ClientError } from "../edge/clientError.js";
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
  lane?: "cheap" | "deep";
  geo_country?: string;
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
  claim_graph: ClaimGraph;
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
      extra_watch_skipped: string[];
      extra_watch_rejected: string[];
      marketplace_label?: string;
      mock: boolean;
      search_listing_url: string;
      dropped_sample: string[];
      dropped_count: number;
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
      (toggles.watch_list && toggles.watch_list.length) ||
      toggles.patent_number ||
      r.claim,
  );
  if (!hasInput) {
    throw new ClientError(
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
    lane: r.lane === "deep" ? "deep" : "cheap",
    geo_country:
      typeof r.geo_country === "string"
        ? r.geo_country
        : typeof (r.geo as { country?: unknown } | undefined)?.country === "string"
          ? (r.geo as { country: string }).country
          : undefined,
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

  const graph = await compileClaimGraph(proposed.claim, config.llm);
  const fingerprints = [
    ...proposed.fingerprints,
    ...graph.must_concepts,
    ...(req.watch_list ?? []).map((w) => w.toLowerCase()),
  ].filter((fp, i, all) => all.indexOf(fp) === i);
  const ignore = req.ignore ?? [];
  const projectId = req.project_id ?? randomUUID();
  const must_match = [
    ...new Set([...proposed.must_match, ...graph.must_concepts]),
  ];
  const country = (req.geo_country ?? "US").trim().toUpperCase() || "US";
  const profile = WatchProfileSchema.parse({
    project_id: projectId,
    stage: req.stage ?? "starting",
    extra_question: req.extra_question,
    claim: proposed.claim,
    fingerprints,
    must_match,
    ignore,
    sources: ["search", "watch"],
    github_url: req.github_url,
    patent_number: req.patent_number,
    links: req.links ?? [],
    watch_list: req.watch_list ?? [],
    stealth: Boolean(req.stealth),
    geo: { country },
  });

  const client = deps.client ?? new BrightDataClient(config);
  const healEvents: HealEvent[] = [];
  const collectorsFailed: string[] = [];
  const collectorsReturned: string[] = [];
  const zodFailures: string[] = [];
  const hits: PileableHit[] = [];

  const query =
    flattenGraphQueries(graph, 1)[0] ??
    fingerprints.filter((f) => f.length > 3).slice(0, 6).join(" ");
  const plan = planLanes({
    country,
    lane: req.lane === "deep" ? "deep" : "cheap",
    collectors: config.collectors,
    searchListingUrl: config.searchListingUrl,
    watchUrl: config.watchUrl,
    query,
  });
  collectorsFailed.push(
    ...plan.missing.map((m) => `${m.key}: ${m.reason}`),
  );

  const scrapeJobs =
    req.lanes !== undefined
      ? plan.jobs.filter(
          (j) =>
            req.lanes!.includes(j.key as "search" | "watch") ||
            req.lanes!.includes(j.family as "search" | "watch"),
        )
      : plan.jobs;

  for (const job of scrapeJobs) {
    const outcome = await scrapeAndValidate(client, config, job.key, {
      autoApprove: req.auto_approve_heal,
      url: job.url,
    });
    healEvents.push(...outcome.healEvents);
    if (!outcome.stored_as_success) {
      collectorsFailed.push(
        `${job.key}: ${outcome.error ?? "validation failed — not stored as success"}`,
      );
      if (outcome.error) zodFailures.push(`${job.key}: ${outcome.error}`);
      continue;
    }
    collectorsReturned.push(job.key);
    hits.push(
      ...outcome.rows.map((r) => ({
        ...r,
        collector: job.key,
        region: job.region,
        office: job.office,
        home: job.home,
      })),
    );
  }

  const wantedPatent = scrapeJobs.some((j) => j.key === "patent");
  let listingUnlocker = false;
  if (wantedPatent && !hits.some((h) => h.collector === "patent")) {
    const listing = await fetchPatentListings(config, query, { country });
    collectorsFailed.push(...listing.failed);
    if (listing.skipped) {
      collectorsFailed.push(
        `unlocker:listing: ${listing.skipped} — Studio Patents crawler cannot open patents.google.com`,
      );
    } else if (listing.rows.length === 0 && listing.failed.length === 0) {
      collectorsFailed.push(
        "unlocker:listing: no patent cards in Unlocker markdown",
      );
    } else if (listing.rows.length) {
      hits.push(...listing.rows);
      listingUnlocker = true;
    }
  }

  let serpPatent = false;
  let serpSnapshots: Record<string, string[]> = {};
  if (wantedPatent) {
    const discovery = await fetchPatentSerpDiscovery(config, proposed.claim);
    collectorsFailed.push(...discovery.failed);
    serpSnapshots = mergeSnapshots(serpSnapshots, discovery.snapshots);
    if (discovery.skipped) {
      collectorsFailed.push(`serp:patent: ${discovery.skipped}`);
    } else if (discovery.rows.length) {
      mergeHits(hits, discovery.rows);
      serpPatent = true;
    }
  }

  if (req.include_adjuncts !== false) {
    const regional = await fetchRegionalSerp(config, proposed.claim);
    collectorsFailed.push(...regional.failed);
    serpSnapshots = mergeSnapshots(serpSnapshots, regional.snapshots);
    if (regional.skipped) {
      collectorsFailed.push(`serp:regional: ${regional.skipped}`);
    } else if (regional.rows.length) {
      mergeHits(hits, regional.rows);
      serpPatent = true;
    }
  }

  const adjunct =
    req.include_adjuncts === false
      ? { rows: [], sources_used: [] as string[], collectors_failed: [] as string[] }
      : await fetchAdjuncts(config, {
          fingerprints,
          claim: proposed.claim,
          githubUrl: req.github_url,
          patentNumber: req.patent_number,
          queries: flattenGraphQueries(graph, 4),
        });
  hits.push(...adjunct.rows);
  collectorsFailed.push(...adjunct.collectors_failed);

  const extraDecision = extraWatchUrls([
    ...(req.watch_list ?? []),
    ...(req.links ?? []),
  ]);
  const extraRejected = extraDecision.rejected.map(
    (r) => `${r.url}: ${r.reason}`,
  );
  const extraSkipped: string[] = [];
  const deep = req.lane === "deep";
  if (!deep) {
    extraSkipped.push(
      ...extraDecision.accepted.map(
        (u) => `${u} (cheap lane — extra Discovery URLs run on deep)`,
      ),
    );
  } else {
    for (const url of extraDecision.accepted.slice(0, 5)) {
      const outcome = await scrapeAndValidate(client, config, "watch", {
        autoApprove: req.auto_approve_heal,
        url,
      });
      healEvents.push(...outcome.healEvents);
      if (!outcome.stored_as_success) {
        collectorsFailed.push(
          `watch:${url}: ${outcome.error ?? "validation failed — not stored as success"}`,
        );
        continue;
      }
      collectorsReturned.push(`watch:${new URL(url).hostname}`);
      hits.push(
        ...outcome.rows.map((r) => ({
          ...r,
          collector: "watch",
          region: "us",
          home: country === "US",
        })),
      );
    }
  }

  const market =
    req.include_adjuncts === false
      ? {
          rows: [] as PileableHit[],
          sources_used: [] as string[],
          collectors_failed: [] as string[],
          label: undefined as string | undefined,
        }
      : await fetchMarketplaceAdjuncts(config, {
          fingerprints,
          deep,
          claim: proposed.claim,
        });
  hits.push(...market.rows);
  collectorsFailed.push(...market.collectors_failed);

  const details = await enrichPatentDetails(config, hits, {
    deep,
    country,
  });
  hits.splice(0, hits.length, ...details.hits);
  const unlockerSources: string[] = [];
  if (listingUnlocker || details.fetched > 0) unlockerSources.push("unlocker");
  if (serpPatent) unlockerSources.push("serp");
  collectorsFailed.push(...details.failed);
  if (details.skipped && details.attempted > 0) {
    collectorsFailed.push(
      `unlocker: ${details.skipped} — patent cards kept as listing-only`,
    );
  }

  const patentCards = hits.filter(isPatentCard);
  if (patentCards.length) {
    const scored = await scorePatentThreats(proposed.claim, patentCards, {
      llm: config.llm,
      minScore: config.patentOverlapMin,
    });
    const byUrl = new Map(scored.map((h) => [h.url, h]));
    for (let i = 0; i < hits.length; i++) {
      const next = byUrl.get(hits[i]!.url);
      if (next) hits[i] = next;
    }
  }

  const piles = mapHitsToPiles(hits, {
    fingerprints,
    must_match,
    ignore,
    overlap_min: config.patentOverlapMin,
  });
  const piledHits = allPileHits(piles);
  const piledUrls = new Set(piledHits.map((h) => h.url));
  const droppedHits = hits.filter((h) => !piledUrls.has(h.url));
  const dropped_count = droppedHits.length;
  const dropped_sample = droppedHits
    .slice(0, 8)
    .map((h) => `${h.title} (${h.source_domain})`);
  const baseline = {
    project_id: projectId,
    at: new Date().toISOString(),
    hit_ids: piledHits.map((h) => h.id),
    urls: piledHits.map((h) => h.url),
    content_hashes: piledHits.map((h) => h.content_hash),
    snapshots: mergeSnapshots(
      {
        "serp::patent": hits.filter(isPatentCard).map((h) => h.url),
        "serp::regional": hits
          .filter((h) => h.home === false && /^(yandex|baidu|naver)$/i.test(h.region ?? ""))
          .map((h) => h.url),
      },
      serpSnapshots,
    ),
  };
  await saveBaseline(baseline);

  return {
    status: "ok",
    claim: proposed.claim,
    fingerprints,
    claim_graph: graph,
    profile,
    piles,
    sources_used: [
      ...collectorsReturned,
      ...adjunct.sources_used,
      ...market.sources_used,
      ...unlockerSources,
    ],
    collectors_failed: collectorsFailed,
    quality: {
      hit_count_per_pile: pileCounts(piles),
      collectors_returned: collectorsReturned.filter(
        (s) =>
          s === "search" ||
          s === "watch" ||
          s === "patent" ||
          s.startsWith("watch:") ||
          s.startsWith("patent_") ||
          s.startsWith("region_"),
      ),
      zod_failures: zodFailures,
      empty_shipped_pile: piles.shipped_last_7_days.length === 0,
      hits_scraped: hits.length,
      hits_matched: piledHits.length,
      extra_watch_skipped: extraSkipped,
      extra_watch_rejected: extraRejected,
      marketplace_label: market.sources_used.length ? market.label : undefined,
      mock: config.mock,
      search_listing_url: config.searchListingUrl,
      dropped_sample,
      dropped_count,
    },
    baseline,
    heal_events: healEvents,
    analyst_contract: ANALYST_CONTRACT,
  };
}
