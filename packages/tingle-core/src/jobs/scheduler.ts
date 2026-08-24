import { timingSafeEqual } from "node:crypto";
import type http from "node:http";
import { BrightDataClient } from "../bd/client.js";
import type { TingleConfig } from "../config.js";
import {
  listWatchingProjects,
  saveProject,
  type StoredProject,
} from "../store.js";
import { redactSecrets } from "../vault.js";
import { tingleTick, type TickProject, type TickResult } from "./tingleTick.js";

export type TickLoopResult = {
  ticked: number;
  failed: number;
};

export function toTickProject(p: StoredProject): TickProject {
  return {
    id: p.id,
    stage: p.stage,
    claim: p.claim,
    ignore: p.ignore,
    tingle_on: p.tingle_on,
    alert_email: p.alert_email,
    digest_floor: p.digest_floor,
    budget: p.budget,
    paused: p.paused,
    paused_reason: p.paused_reason,
    last_digest_at: p.last_digest_at,
    profile: p.profile,
    events: p.events,
    webhook_url: p.webhook_url,
  };
}

export function applyTickResult(project: StoredProject, result: TickResult): void {
  project.budget = result.budget;
  project.paused = result.paused;
  project.paused_reason = result.paused_reason;
  project.last_tick_at = new Date().toISOString();
  project.events.push(...result.events);
  project.mail.push(...result.mail);
  if (result.mail.some((m) => m.urgency !== "now")) {
    project.last_digest_at = new Date().toISOString();
  }
  if (project.profile) {
    project.profile.budget = result.budget;
    project.profile.paused = result.paused;
    if (result.baseline) project.profile.baseline_ids = result.baseline.hit_ids;
  }
}

/**
 * One pass over every watching project. Heals stay preview-only unless
 * TINGLE_HEAL_AUTO_APPROVE=1 (CI). A missing pin is a collector failure, not
 * an empty niche — tingleTick already records that.
 */
export async function runWatchingTicks(
  config: TingleConfig,
  hooks?: { afterPersist?: (project: StoredProject) => Promise<void> },
): Promise<TickLoopResult> {
  const client = new BrightDataClient(config);
  const rows = await listWatchingProjects();
  let ticked = 0;
  let failed = 0;
  for (const project of rows) {
    try {
      const result = await tingleTick(toTickProject(project), { config, client }, {
        autoApproveHeal: process.env.TINGLE_HEAL_AUTO_APPROVE === "1",
      });
      applyTickResult(project, result);
      await saveProject(project);
      await hooks?.afterPersist?.(project);
      ticked += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        "tingle tick failed",
        project.id,
        project.stealth ? "[stealth]" : redactSecrets(msg, [project.claim, project.pitch]),
      );
    }
  }
  return { ticked, failed };
}

export function startTickLoop(config: TingleConfig, afterPersist?: (p: StoredProject) => Promise<void>): void {
  const ms = Number(process.env.TINGLE_TICK_MS ?? 15 * 60 * 1000);
  if (!(ms > 0)) return;
  setInterval(() => {
    void runWatchingTicks(config, { afterPersist });
  }, ms);
}

export function cronSecretOk(req: http.IncomingMessage): boolean {
  const expected = process.env.TINGLE_CRON_SECRET?.trim();
  if (!expected) return true;
  const header = req.headers.authorization ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const alt = String(req.headers["x-cron-secret"] ?? "").trim();
  const got = bearer || alt;
  if (!got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
