import { randomUUID } from "node:crypto";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import type { CollectorKey, TingleConfig } from "../config.js";
import { isCapHit, PAUSE_COPY, remaining, spend, wouldExceed } from "../budget.js";
import { isClaimRelevant, searchPhrasesFromClaim } from "../claim.js";
import { extractSearchPhrases } from "../llm.js";
import { fileMailer, mailFromEvents, type Mailer, type OutgoingMail } from "../mail.js";
import {
  contentHash,
  daysSince,
  entityKey,
  hitId,
  type PileableHit,
  type PileHit,
} from "../piles.js";
import type { HealEvent, TingleEvent, Urgency } from "../schema/events.js";
import type { Budget, DigestFloor, Stage, WatchProfile } from "../schema/profile.js";
import {
  isNewVersusBaseline,
  loadBaseline,
  mergeBaseline,
  mergeSnapshots,
  saveBaseline,
  type Baseline,
} from "./baseline.js";
import { classifyHit, maxUrgency } from "./classify.js";
import { clusterEntityKey, clusterHits, isMuted } from "../dedup.js";
import { extraWatchUrls } from "../longTail.js";
import { fetchMarketplaceAdjuncts } from "../marketplace.js";
import { planLanes } from "../collectors.js";
import { isOptionalGap } from "../adjunct.js";
import { enrichPatentDetails } from "./patentDetails.js";
import { fetchPatentListings } from "./patentListings.js";
import {
  fetchPatentSerpDiscovery,
  fetchRegionalSerp,
} from "./serpDiscovery.js";
import { isPatentCard, scorePatentThreats } from "./claimCompare.js";
import { fireWatchAlerts } from "../alerts.js";
import { mergeHits } from "../piles.js";

export const TINGLE_TRANSPORT = "POST /dca/trigger" as const;

export type TickProject = {
  id: string;
  stage: Stage;
  claim: string;
  ignore: string[];
  tingle_on: boolean;
  alert_email?: string;
  digest_floor: DigestFloor;
  budget: Budget;
  paused: boolean;
  paused_reason?: string;
  last_digest_at?: string;
  profile?: WatchProfile;
  events: TingleEvent[];
  webhook_url?: string;
};

export type TickOpts = {
  extraRows?: Partial<Record<CollectorKey, unknown[]>>;
  /** Extra validated hits (adjunct / fixture) merged after Studio rows. */
  extraHits?: PileableHit[];
  autoApproveHeal?: boolean;
  now?: Date;
  mailer?: Mailer;
  /** Skip the "digest due" wait so tests can assert a quiet mail. */
  forceDigest?: boolean;
};

export type TickResult = {
  status: "ok" | "skipped" | "paused";
  reason?: string;
  events: TingleEvent[];
  new_event_count: number;
  mail: OutgoingMail[];
  page_loads: number;
  budget: Budget;
  paused: boolean;
  paused_reason?: string;
  transport: typeof TINGLE_TRANSPORT;
  collectors_failed: string[];
  heal_events: HealEvent[];
  baseline?: Baseline;
};

function toPileHit(hit: PileableHit, now: Date): PileHit {
  const age = daysSince(hit.published_at, now);
  return {
    ...hit,
    id: hitId(hit.url),
    why: "new vs baseline",
    collector: hit.collector ?? hit.source,
    content_hash: contentHash(hit),
    entity_key: entityKey(hit),
    days_old: age,
  };
}

function digestDue(project: TickProject, now: Date, force?: boolean): boolean {
  if (force) return true;
  if (!project.last_digest_at) return false;
  const ms = project.digest_floor === "weekly" ? 7 * 86_400_000 : 86_400_000;
  return now.getTime() - Date.parse(project.last_digest_at) >= ms;
}

function eventsFromHits(
  project: TickProject,
  hits: PileHit[],
  fingerprints: string[],
): TingleEvent[] {
  const groups = clusterHits(hits, fingerprints);
  const out: TingleEvent[] = [];
  for (const group of groups) {
    const classified = group.map((h) => ({ hit: h, ...classifyHit(h, project.stage) }));
    const type = classified.find((c) => c.type === "just_shipped")?.type
      ?? classified[0]!.type;
    const urgency = classified.reduce<Urgency>(
      (acc, c) => maxUrgency(acc, c.urgency),
      "note",
    );
    out.push({
      id: randomUUID(),
      project_id: project.id,
      at: new Date().toISOString(),
      type,
      urgency,
      claim_fingerprint: fingerprints[0] ?? project.claim.slice(0, 80),
      entity_key: clusterEntityKey(group),
      content_hash: group[0]!.content_hash,
      sources: group.map((h) => ({ collector: h.collector, url: h.url })),
      hit_ids: group.map((h) => h.id),
    });
  }
  return out;
}

export async function tingleTick(
  project: TickProject,
  deps: {
    config: TingleConfig;
    client: BrightDataClient;
  },
  opts: TickOpts = {},
): Promise<TickResult> {
  const transport = TINGLE_TRANSPORT;
  const empty = (status: TickResult["status"], reason: string, extra: Partial<TickResult> = {}): TickResult => ({
    status,
    reason,
    events: [],
    new_event_count: 0,
    mail: [],
    page_loads: 0,
    budget: project.budget,
    paused: project.paused || status === "paused",
    paused_reason: status === "paused" ? (extra.paused_reason ?? PAUSE_COPY) : project.paused_reason,
    transport,
    collectors_failed: [],
    heal_events: [],
    ...extra,
  });

  if (!project.tingle_on) return empty("skipped", "switch off");
  if (!project.alert_email) return empty("skipped", "alert_email required");
  if (project.paused || isCapHit(project.budget)) {
    return empty("paused", PAUSE_COPY, { paused: true, paused_reason: PAUSE_COPY });
  }

  const country = project.profile?.geo?.country ?? "US";
  const query =
    (project.profile?.fingerprints ?? [])
      .filter((f) => f.length > 3)
      .slice(0, 6)
      .join(" ") || project.claim;
  const plan = planLanes({
    country,
    lane: project.budget.lane === "deep" ? "deep" : "cheap",
    collectors: deps.config.collectors,
    searchListingUrl: deps.config.searchListingUrl,
    watchUrl: deps.config.watchUrl,
    query,
  });
  const extra =
    project.budget.lane === "deep"
      ? extraWatchUrls([
          ...(project.profile?.watch_list ?? []),
          ...(project.profile?.links ?? []),
        ]).accepted.slice(0, 5)
      : [];
  const planned = plan.jobs.length + extra.length;
  if (wouldExceed(project.budget, planned) || remaining(project.budget) < planned) {
    return empty("paused", PAUSE_COPY, {
      paused: true,
      paused_reason: PAUSE_COPY,
    });
  }

  const baseline = await loadBaseline(project.id);
  if (!baseline) {
    return empty("skipped", "no baseline — run first look before Tingle");
  }

  const fingerprints = project.profile?.fingerprints ?? [];
  const ignore = [
    ...project.ignore,
    ...(project.profile?.ignore ?? []),
  ];
  const now = opts.now ?? new Date();
  const healEvents: HealEvent[] = [];
  const collectorsFailed: string[] = [
    ...plan.missing
      .filter((m) => m.key !== "patent")
      .map((m) => `${m.key}: ${m.reason}`),
  ];
  const rawHits: PileableHit[] = [];
  let pageLoads = 0;

  for (const job of plan.jobs) {
    const outcome = await scrapeAndValidate(deps.client, deps.config, job.key, {
      autoApprove: opts.autoApproveHeal,
      extraRows: opts.extraRows?.[job.key],
      url: job.url,
    });
    pageLoads += 1;
    healEvents.push(...outcome.healEvents);
    if (!outcome.stored_as_success) {
      collectorsFailed.push(
        `${job.key}: ${outcome.error ?? "validation failed — not stored as success"}`,
      );
      continue;
    }
    rawHits.push(
      ...outcome.rows.map((r) => ({
        ...r,
        collector: job.key,
        region: job.region,
        office: job.office,
        home: job.home,
      })),
    );
  }

  for (const url of extra) {
    const outcome = await scrapeAndValidate(deps.client, deps.config, "watch", {
      autoApprove: opts.autoApproveHeal,
      url,
    });
    pageLoads += 1;
    healEvents.push(...outcome.healEvents);
    if (!outcome.stored_as_success) {
      collectorsFailed.push(
        `watch:${url}: ${outcome.error ?? "validation failed — not stored as success"}`,
      );
      continue;
    }
    rawHits.push(
      ...outcome.rows.map((r) => ({
        ...r,
        collector: "watch",
        region: "us",
        home: country === "US",
      })),
    );
  }

  const patentQuery =
    (await extractSearchPhrases(project.claim, deps.config.llm))[0] ??
    searchPhrasesFromClaim(project.claim)[0] ??
    query;
  {
    const listing = await fetchPatentListings(deps.config, patentQuery, { country });
    collectorsFailed.push(...listing.failed);
    if (listing.rows.length) {
      rawHits.push(...listing.rows);
      if (!deps.config.mock) pageLoads += 1;
    }
  }

  let serpSnapshots: Record<string, string[]> = {};
  {
    const discovery = await fetchPatentSerpDiscovery(deps.config, patentQuery);
    collectorsFailed.push(...discovery.failed);
    serpSnapshots = mergeSnapshots(serpSnapshots, discovery.snapshots);
    if (discovery.rows.length) mergeHits(rawHits, discovery.rows);
  }

  const regional = await fetchRegionalSerp(deps.config, patentQuery);
  collectorsFailed.push(...regional.failed);
  serpSnapshots = mergeSnapshots(serpSnapshots, regional.snapshots);
  if (regional.rows.length) mergeHits(rawHits, regional.rows);

  if (project.budget.lane === "deep") {
    const market = await fetchMarketplaceAdjuncts(deps.config, {
      fingerprints,
      deep: true,
      claim: project.claim,
    });
    rawHits.push(...market.rows);
    collectorsFailed.push(...market.collectors_failed);
  }

  if (opts.extraHits?.length) rawHits.push(...opts.extraHits);

  const details = await enrichPatentDetails(deps.config, rawHits, {
    deep: project.budget.lane === "deep",
    country,
  });
  rawHits.splice(0, rawHits.length, ...details.hits);
  if (!deps.config.mock) pageLoads += details.fetched;
  collectorsFailed.push(...details.failed);
  if (details.skipped && details.attempted > 0) {
    collectorsFailed.push(
      `unlocker: ${details.skipped} — patent cards kept as listing-only`,
    );
  }

  const patentCards = rawHits.filter(isPatentCard);
  if (patentCards.length) {
    const scored = await scorePatentThreats(project.claim, patentCards, {
      llm: deps.config.llm,
      minScore: deps.config.patentOverlapMin,
    });
    const byUrl = new Map(scored.map((h) => [h.url, h]));
    for (let i = 0; i < rawHits.length; i++) {
      const next = byUrl.get(rawHits[i]!.url);
      if (next) rawHits[i] = next;
    }
  }

  const budget = spend(project.budget, pageLoads);
  const paused = isCapHit(budget);
  const paused_reason = paused ? PAUSE_COPY : undefined;

  const relevant = rawHits.filter(
    (h) =>
      !isMuted(h, ignore) &&
      isClaimRelevant(h, fingerprints, project.profile?.must_match ?? [], ignore),
  );
  const piled = relevant.map((h) => toPileHit(h, now));
  const fresh = piled.filter((h) => isNewVersusBaseline(h, baseline));
  const events = eventsFromHits(project, fresh, fingerprints);

  const nextBaseline = mergeBaseline(baseline, piled);
  nextBaseline.snapshots = mergeSnapshots(nextBaseline.snapshots, {
    "serp::patent": rawHits.filter(isPatentCard).map((h) => h.url),
    "serp::regional": rawHits
      .filter((h) => h.home === false && /^(yandex|baidu|naver)$/i.test(h.region ?? ""))
      .map((h) => h.url),
    ...serpSnapshots,
  });
  await saveBaseline(nextBaseline);

  const mailer = opts.mailer ?? fileMailer();
  const mail: OutgoingMail[] = [];
  const nowEvents = events.filter((e) => e.urgency === "now");
  if (nowEvents.length && project.alert_email) {
    mail.push(
      await mailer.send(mailFromEvents(project.id, project.alert_email, nowEvents, "now")),
    );
  }
  const rollup = events.filter((e) => e.urgency === "soon" || e.urgency === "note");
  if (digestDue(project, now, opts.forceDigest)) {
    if (events.length === 0) {
      mail.push(
        await mailer.send(mailFromEvents(project.id, project.alert_email, [], "digest")),
      );
    } else if (rollup.length) {
      mail.push(
        await mailer.send(mailFromEvents(project.id, project.alert_email, rollup, "digest")),
      );
    }
  }

  const alertEvents = nowEvents.length ? nowEvents : rollup;
  if (alertEvents.length) {
    await fireWatchAlerts(
      [
        project.webhook_url,
        deps.config.webhookUrl,
        deps.config.slackWebhookUrl,
        deps.config.discordWebhookUrl,
      ],
      {
        project_id: project.id,
        event_count: alertEvents.length,
        urgency: alertEvents.some((e) => e.urgency === "now") ? "now" : "digest",
        entity_keys: alertEvents.map((e) => e.entity_key),
        urls: alertEvents.flatMap((e) => e.sources.map((s) => s.url)),
        claim: project.profile?.stealth ? undefined : project.claim,
      },
    );
  }

  return {
    status: paused ? "paused" : "ok",
    reason: paused ? PAUSE_COPY : undefined,
    events,
    new_event_count: events.length,
    mail,
    page_loads: pageLoads,
    budget,
    paused,
    paused_reason,
    transport,
    collectors_failed: collectorsFailed.filter((n) => !isOptionalGap(n)),
    heal_events: healEvents,
    baseline: nextBaseline,
  };
}
