import { randomUUID } from "node:crypto";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import type { CollectorKey, TingleConfig } from "../config.js";
import { isCapHit, PAUSE_COPY, remaining, spend, wouldExceed } from "../budget.js";
import { isClaimRelevant } from "../claim.js";
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
  saveBaseline,
  type Baseline,
} from "./baseline.js";
import { classifyHit, maxUrgency } from "./classify.js";
import { clusterEntityKey, clusterHits, isMuted } from "../dedup.js";

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
  reprint: boolean;
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

const STUDIO_LANES: CollectorKey[] = ["search", "watch"];

function toPileHit(hit: PileableHit, now: Date): PileHit {
  const age = daysSince(hit.published_at, now);
  return {
    ...hit,
    id: hitId(hit.url),
    why: "new vs baseline",
    collector: hit.source,
    content_hash: contentHash(hit),
    entity_key: entityKey(hit),
    days_old: age,
  };
}

function lanesFor(profile?: WatchProfile): CollectorKey[] {
  const wanted = (profile?.sources ?? STUDIO_LANES).filter((s): s is CollectorKey =>
    s === "search" || s === "watch" || s === "chaos",
  );
  const studio = wanted.filter((s) => s === "search" || s === "watch");
  return studio.length ? studio : [...STUDIO_LANES];
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
    reprint: false,
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

  const lanes = lanesFor(project.profile);
  if (wouldExceed(project.budget, lanes.length) || remaining(project.budget) < lanes.length) {
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
  const collectorsFailed: string[] = [];
  const rawHits: PileableHit[] = [];
  let pageLoads = 0;

  for (const source of lanes) {
    const outcome = await scrapeAndValidate(deps.client, deps.config, source, {
      autoApprove: opts.autoApproveHeal,
      extraRows: opts.extraRows?.[source],
    });
    pageLoads += 1;
    healEvents.push(...outcome.healEvents);
    if (!outcome.stored_as_success) {
      collectorsFailed.push(
        `${source}: ${outcome.error ?? "validation failed — not stored as success"}`,
      );
      continue;
    }
    rawHits.push(...outcome.rows);
  }

  if (opts.extraHits?.length) rawHits.push(...opts.extraHits);

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
  const reprint = events.some((e) =>
    e.hit_ids.every((id) => baseline.hit_ids.includes(id)),
  );

  const nextBaseline = mergeBaseline(baseline, piled);
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

  return {
    status: paused ? "paused" : "ok",
    reason: paused ? PAUSE_COPY : undefined,
    events,
    new_event_count: events.length,
    reprint,
    mail,
    page_loads: pageLoads,
    budget,
    paused,
    paused_reason,
    transport,
    collectors_failed: collectorsFailed,
    heal_events: healEvents,
    baseline: nextBaseline,
  };
}
