import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { analystReply } from "./analyst.js";
import { PAUSE_COPY, spend } from "./budget.js";
import { BrightDataClient } from "./bd/client.js";
import { mockNewWatchLaunch } from "./bd/mock.js";
import { proposeClaim } from "./claim.js";
import { CLAIM_LOCK_WARNING, muteTokens } from "./dedup.js";
import { loadEnv, loadTingleConfig } from "./config.js";
import { firstLook, parseFirstLookRequest } from "./jobs/firstLook.js";
import { removeBaseline } from "./jobs/baseline.js";
import { tingleTick, type TickProject, type TickResult } from "./jobs/tingleTick.js";
import { mapHitsToPiles, type PileableHit } from "./piles.js";
import type { CollectorKey } from "./schema/hits.js";
import type { Stage } from "./schema/profile.js";
import {
  createSession,
  createUser,
  destroySession,
  getProject,
  listProjects,
  listWatchingProjects,
  loginUser,
  newProjectFields,
  publicProject,
  revokeProject,
  saveProject,
  userFromSession,
  type StoredProject,
} from "./store.js";
import { VAULT_PROMISE, redactSecrets } from "./vault.js";

loadEnv();

const COOKIE = "tingle_sid";
const ALLOW_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export async function handleTingleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const origin = req.headers.origin;
  if (origin && ALLOW_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = req.method ?? "GET";
  const sid = cookie(req, COOKIE);
  const config = loadTingleConfig();

  try {
    if (method === "GET" && (path === "/" || path === "/health")) {
      json(res, 200, { ok: true, mock: config.mock, collectors: config.collectors });
      return;
    }

    if (method === "POST" && path === "/auth/signup") {
      const body = asRec(await readJson(req));
      const user = await createUser(str(body.email), str(body.password));
      const session = await createSession(user.id);
      setCookie(res, session.id);
      json(res, 201, { id: user.id, email: user.email });
      return;
    }

    if (method === "POST" && path === "/auth/login") {
      const body = asRec(await readJson(req));
      const user = await loginUser(str(body.email), str(body.password));
      if (!user) {
        json(res, 401, { error: "invalid email or password" });
        return;
      }
      const session = await createSession(user.id);
      setCookie(res, session.id);
      json(res, 200, { id: user.id, email: user.email });
      return;
    }

    if (method === "POST" && path === "/auth/logout") {
      if (sid) await destroySession(sid);
      setCookie(res, "", 0);
      json(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/me") {
      const user = await userFromSession(sid);
      if (!user) {
        json(res, 401, { error: "not signed in" });
        return;
      }
      json(res, 200, {
        id: user.id,
        email: user.email,
        vault_promise: VAULT_PROMISE,
      });
      return;
    }

    if (method === "POST" && path === "/first-look") {
      const parsed = parseFirstLookRequest(await readJson(req));
      const result = await firstLook(parsed, {
        config,
        client: new BrightDataClient(config),
      });
      json(res, result.status === "needs_confirm" ? 409 : 200, result);
      return;
    }

    const user = await userFromSession(sid);
    if (!user) {
      json(res, 401, { error: "not signed in" });
      return;
    }

    if (method === "GET" && path === "/projects") {
      const rows = await listProjects(user.id);
      json(res, 200, { projects: rows.map(publicProject) });
      return;
    }

    if (method === "POST" && path === "/projects") {
      const body = asRec(await readJson(req));
      const pitch = str(body.pitch) || undefined;
      const claimIn = str(body.claim) || undefined;
      const proposed = proposeClaim({
        pitch,
        docs_text: str(body.docs_text) || undefined,
        claim: claimIn,
      });
      if (!proposed.claim) {
        json(res, 400, { error: "need a pitch, docs, or claim" });
        return;
      }
      const project: StoredProject = {
        id: randomUUID(),
        user_id: user.id,
        created_at: new Date().toISOString(),
        stage: parseStage(body.stage),
        extra_question: str(body.extra_question) || undefined,
        pitch,
        docs_text: str(body.docs_text) || undefined,
        links: strs(body.links),
        github_url: str(body.github_url) || undefined,
        watch_list: strs(body.watch_list),
        patent_number: str(body.patent_number) || undefined,
        ignore: strs(body.ignore),
        claim: proposed.claim,
        claim_confirmed: false,
        messages: [],
        ...newProjectFields(),
        stealth:
          body.stealth === true ||
          /stealth/i.test(str(body.extra_question)),
        collectors: pinnedCollectors(config),
      };
      await saveProject(project);
      json(res, 201, {
        project: publicProject(project),
        proposed_claim: proposed.claim,
        fingerprints: proposed.fingerprints,
      });
      return;
    }

    const projectMatch = path.match(
      /^\/projects\/([^/]+)(?:\/(first-look|mute|analyst|tingle|feed|tick|budget|revoke|claim))?$/,
    );
    if (projectMatch) {
      const project = await getProject(user.id, projectMatch[1]);
      if (!project) {
        json(res, 404, { error: "project not found" });
        return;
      }
      const action = projectMatch[2];

      if (project.revoked && action && action !== "revoke") {
        json(res, 410, {
          error: "project revoked",
          leftover: {
            email: user.email,
            budget: project.budget,
            collectors: project.collectors,
          },
        });
        return;
      }

      if (method === "GET" && !action) {
        json(res, 200, { project: publicProject(project) });
        return;
      }

      if (method === "POST" && action === "first-look") {
        const body = asRec(await readJson(req));
        const incoming = str(body.claim) || project.claim;
        const rebuild = body.rebuild === true;
        if (
          project.claim_locked &&
          incoming !== project.claim &&
          !rebuild
        ) {
          json(res, 409, {
            status: "claim_locked",
            warning: CLAIM_LOCK_WARNING,
            claim: project.claim,
          });
          return;
        }
        if (!body.confirmed && !project.claim_confirmed) {
          json(res, 409, {
            status: "needs_confirm",
            proposed_claim: incoming,
          });
          return;
        }
        const claim = project.claim_locked && !rebuild ? project.claim : incoming;
        project.claim = claim;
        project.claim_confirmed = true;
        project.claim_locked = true;
        project.draft_claim = claim;
        const result = await firstLook(
          {
            project_id: project.id,
            stage: project.stage,
            extra_question: project.extra_question,
            confirmed: true,
            claim,
            pitch: project.pitch,
            docs_text: project.docs_text,
            links: project.links,
            github_url: project.github_url,
            watch_list: project.watch_list,
            patent_number: project.patent_number,
            ignore: project.ignore,
            stealth: project.stealth,
          },
          { config, client: new BrightDataClient(config) },
        );
        if (result.status !== "ok") {
          json(res, 409, result);
          return;
        }
        project.profile = result.profile;
        project.last_look = result;
        project.collectors = pinnedCollectors(config);
        const loads = result.quality.collectors_returned.filter(
          (s) => s === "search" || s === "watch",
        ).length;
        project.budget = spend(project.budget, loads);
        project.messages.push({
          id: randomUUID(),
          role: "analyst",
          text: analystReply("summarize", result).text,
          at: new Date().toISOString(),
        });
        await saveProject(project);
        json(res, 200, { project: publicProject(project) });
        return;
      }

      if (method === "POST" && action === "mute") {
        const body = asRec(await readJson(req));
        const tokens = muteTokens({
          url: str(body.url) || undefined,
          title: str(body.title) || undefined,
          entity_key: str(body.entity_key) || undefined,
        });
        if (!tokens.length) {
          json(res, 400, { error: "url, title, or entity_key required" });
          return;
        }
        for (const t of tokens) {
          if (!project.ignore.includes(t)) project.ignore.push(t);
        }
        if (project.profile) project.profile.ignore = project.ignore;
        if (project.last_look) {
          const hits = [
            ...project.last_look.piles.stand_on_this,
            ...project.last_look.piles.already_in_the_lane,
            ...project.last_look.piles.shipped_last_7_days,
          ];
          project.last_look.piles = mapHitsToPiles(hits, {
            fingerprints: project.last_look.fingerprints,
            must_match: project.profile?.must_match,
            ignore: project.ignore,
          });
        }
        await saveProject(project);
        json(res, 200, { project: publicProject(project) });
        return;
      }

      if (method === "POST" && action === "analyst") {
        const body = asRec(await readJson(req));
        const message = str(body.message);
        if (!message) {
          json(res, 400, { error: "message required" });
          return;
        }
        project.messages.push({
          id: randomUUID(),
          role: "user",
          text: message,
          at: new Date().toISOString(),
        });
        const reply = analystReply(message, project.last_look);
        project.messages.push({
          id: randomUUID(),
          role: "analyst",
          text: reply.text,
          at: new Date().toISOString(),
        });
        await saveProject(project);
        json(res, 200, { project: publicProject(project), covered: reply.covered });
        return;
      }

      if (method === "POST" && action === "tingle") {
        const body = asRec(await readJson(req));
        const on = body.on === true || body.on === "true";
        if (on) {
          const email = str(body.alert_email) || user.email;
          if (!email) {
            json(res, 400, { error: "alert_email required to turn Tingle on" });
            return;
          }
          if (!project.last_look) {
            json(res, 400, { error: "run first look before turning Tingle on" });
            return;
          }
          project.tingle_on = true;
          project.alert_email = email;
          project.digest_floor =
            body.digest_floor === "weekly" ? "weekly" : "daily";
          project.last_digest_at = new Date().toISOString();
          if (project.profile) {
            project.profile.tingle_on = true;
            project.profile.alert_email = email;
            project.profile.digest_floor = project.digest_floor;
          }
        } else {
          project.tingle_on = false;
          if (project.profile) project.profile.tingle_on = false;
        }
        await saveProject(project);
        json(res, 200, { project: publicProject(project) });
        return;
      }

      if (method === "GET" && action === "feed") {
        json(res, 200, {
          events: project.events,
          tingle_on: project.tingle_on,
          paused: project.paused,
          paused_reason: project.paused_reason,
          budget: project.budget,
        });
        return;
      }

      if (method === "POST" && action === "budget") {
        const body = asRec(await readJson(req));
        const cap = Number(body.cap);
        if (!Number.isFinite(cap) || cap < 0) {
          json(res, 400, { error: "cap must be a non-negative number" });
          return;
        }
        project.budget = { ...project.budget, cap };
        if (project.paused && project.budget.spent < project.budget.cap) {
          project.paused = false;
          project.paused_reason = undefined;
        }
        if (project.budget.spent >= project.budget.cap) {
          project.paused = true;
          project.paused_reason = PAUSE_COPY;
        }
        if (project.profile) project.profile.budget = project.budget;
        await saveProject(project);
        json(res, 200, { project: publicProject(project) });
        return;
      }

      if (method === "POST" && action === "tick") {
        const body = asRec(await readJson(req));
        const extraRows = config.mock ? extraHitsFromBody(body) : undefined;
        const extraHits = config.mock ? clusterFixtureHits(body) : undefined;
        const result = await tingleTick(asTickProject(project), {
          config,
          client: new BrightDataClient(config),
        }, {
          extraRows,
          extraHits,
          autoApproveHeal: process.env.TINGLE_HEAL_AUTO_APPROVE === "1",
        });
        applyTick(project, result);
        await saveProject(project);
        json(res, 200, {
          project: publicProject(project),
          tick: result,
        });
        return;
      }

      if (method === "POST" && action === "claim") {
        const body = asRec(await readJson(req));
        const incoming = str(body.claim);
        if (!incoming) {
          json(res, 400, { error: "claim required" });
          return;
        }
        if (body.rebuild !== true) {
          project.draft_claim = incoming;
          await saveProject(project);
          json(res, 200, {
            project: publicProject(project),
            job_changed: false,
            warning: CLAIM_LOCK_WARNING,
          });
          return;
        }
        json(res, 409, {
          status: "claim_locked",
          warning: CLAIM_LOCK_WARNING,
          hint: "POST /projects/:id/first-look with rebuild: true and confirmed: true",
        });
        return;
      }

      if (method === "POST" && action === "revoke") {
        const stub = await revokeProject(user.id, project.id);
        await removeBaseline(project.id);
        json(res, 200, {
          leftover: {
            email: user.email,
            budget: stub?.budget ?? project.budget,
            collectors: stub?.collectors ?? project.collectors,
          },
          project: stub ? publicProject(stub) : publicProject({ ...project, revoked: true }),
        });
        return;
      }
    }

    if (method === "POST" && path === "/quick-chat") {
      const body = asRec(await readJson(req));
      const message = str(body.message);
      if (!message) {
        json(res, 400, { error: "message required" });
        return;
      }
      const proposed = proposeClaim({ pitch: message });
      const look = await firstLook(
        {
          pitch: message,
          claim: proposed.claim,
          confirmed: true,
          stage: "starting",
          lanes: ["search"],
          include_adjuncts: false,
        },
        { config, client: new BrightDataClient(config) },
      );
      if (look.status !== "ok") {
        json(res, 409, look);
        return;
      }
      json(res, 200, {
        claim: look.claim,
        look,
        reply: analystReply(message, look).text,
        tingle: false,
      });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = /already registered|invalid email|password/.test(msg) ? 400 : 500;
    json(res, code, { error: msg });
  }
}

function parseStage(raw: unknown): Stage {
  if (raw === "building" || raw === "shipped" || raw === "starting") return raw;
  return "starting";
}

function cookie(req: http.IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function setCookie(res: http.ServerResponse, value: string, maxAge = 604800) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

const server = http.createServer((req, res) => {
  void handleTingleRequest(req, res);
});

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const config = loadTingleConfig();
  server.listen(config.apiPort, () => {
    console.log(
      `Tingle API http://127.0.0.1:${config.apiPort} mock=${config.mock}`,
    );
  });
  const ms = Number(process.env.TINGLE_TICK_MS ?? 15 * 60 * 1000);
  if (ms > 0) {
    setInterval(() => {
      void tickEnabled(config);
    }, ms);
  }
}

function asTickProject(p: StoredProject): TickProject {
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
  };
}

function applyTick(project: StoredProject, result: TickResult): void {
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

async function tickEnabled(config: ReturnType<typeof loadTingleConfig>) {
  const client = new BrightDataClient(config);
  const rows = await listWatchingProjects();
  for (const project of rows) {
    try {
      const result = await tingleTick(asTickProject(project), { config, client }, {
        autoApproveHeal: process.env.TINGLE_HEAL_AUTO_APPROVE === "1",
      });
      applyTick(project, result);
      await saveProject(project);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        "tingle tick failed",
        project.id,
        project.stealth ? "[stealth]" : redactSecrets(msg, [project.claim, project.pitch]),
      );
    }
  }
}

function extraHitsFromBody(
  body: Record<string, unknown>,
): Partial<Record<CollectorKey, unknown[]>> | undefined {
  if (body.inject_new_watch === true) {
    return { watch: [mockNewWatchLaunch()] };
  }
  const raw = body.extra_hits;
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<CollectorKey, unknown[]>> = {};
  for (const key of ["search", "watch", "chaos"] as const) {
    const rows = (raw as Record<string, unknown>)[key];
    if (Array.isArray(rows)) out[key] = rows;
  }
  return Object.keys(out).length ? out : undefined;
}

function clusterFixtureHits(body: Record<string, unknown>): PileableHit[] | undefined {
  if (body.cluster_fixture !== true) return undefined;
  const title = "TwinLane";
  const snippet =
    "a watch that tells indie builders when someone else ships their idea";
  return [
    {
      source: "search",
      title,
      url: "https://dev.to/example/twinlane",
      snippet,
      published_at: new Date().toISOString().slice(0, 10),
      source_domain: "dev.to",
    },
    {
      source: "watch",
      title,
      url: "https://www.uneed.best/tool/twinlane",
      snippet,
      published_at: new Date().toISOString().slice(0, 10),
      source_domain: "uneed.best",
    },
    {
      source: "hn",
      title,
      url: "https://news.ycombinator.com/item?id=9001",
      snippet,
      published_at: new Date().toISOString().slice(0, 10),
      source_domain: "news.ycombinator.com",
    },
  ];
}

function pinnedCollectors(config: ReturnType<typeof loadTingleConfig>): string[] {
  const ids = [
    config.collectors.search,
    config.collectors.watch,
    config.collectors.chaos,
  ].filter((id): id is string => Boolean(id));
  return ids.length ? ids : ["mock_search", "mock_watch", "mock_chaos"];
}
