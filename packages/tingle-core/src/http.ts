import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { answerAnalyst } from "./analyst.js";
import { PAUSE_COPY, spend, wouldExceed, isCapHit } from "./budget.js";
import { BrightDataClient } from "./bd/client.js";
import { mockNewWatchLaunch } from "./bd/mock.js";
import { proposeClaim, titleFromClaim } from "./claim.js";
import { polishClaim } from "./llm.js";
import { CLAIM_LOCK_WARNING, muteTokens } from "./dedup.js";
import { loadEnv, loadTingleConfig, type TingleConfig } from "./config.js";
import { firstLook, parseFirstLookRequest } from "./jobs/firstLook.js";
import { runPatentability } from "./jobs/patentability.js";
import { removeBaseline } from "./jobs/baseline.js";
import { tingleTick } from "./jobs/tingleTick.js";
import {
  applyTickResult,
  cronSecretOk,
  runWatchingTicks,
  startTickLoop,
  toTickProject,
} from "./jobs/scheduler.js";
import { mapHitsToPiles, type PileableHit } from "./piles.js";
import type { CollectorKey } from "./config.js";
import type { Stage, WatchProfile } from "./schema/profile.js";
import {
  assertDbReadable,
  createSession,
  createUser,
  createDemoUser,
  destroySession,
  getProject,
  listProjects,
  listWatchingProjects,
  loginUser,
  newProjectFields,
  publicProject,
  revokeProject,
  saveProject,
  upsertOauthUser,
  userFromSession,
  type StoredProject,
} from "./store.js";
import { GITHUB_STORAGE_COPY, parseGithubRepoRef, syncTingleTree } from "./githubStorage.js";
import {
  exchangeGithub,
  exchangeGoogle,
  githubAuthorizeUrl,
  googleAuthorizeUrl,
  newOauthState,
  oauthProviders,
  takeOauthState,
} from "./oauth.js";
import { VAULT_PROMISE, redactSecrets } from "./vault.js";
import { foldAttachmentText, parseIncomingAttachments } from "./attachments.js";
import { understandUploads } from "./jobs/understandUploads.js";
import { ClientError } from "./edge/clientError.js";
import { assertAnonLookAllowed } from "./edge/limits.js";
import {
  EmailPasswordBody,
  QuickChatBody,
  parseBody,
} from "./edge/bodies.js";
import {
  SESSION_COOKIE,
  asRec,
  json,
  readCookie,
  readJson,
  redirect,
  sessionCookieHeader,
  setSessionCookie,
  str,
  strs,
} from "./edge/httpIo.js";
import { ZodError } from "zod";

/**
 * Tingle HTTP API (default port 8788).
 *
 * Public (no session):
 *   GET  /health
 *   GET  /auth/providers
 *   GET  /auth/github | /auth/google  (+ /callback)
 *   POST /auth/signup | /login | /demo | /logout
 *   POST /quick-chat
 *   POST /first-look
 *
 * Session:
 *   GET  /me
 *   GET|POST /projects
 *   GET  /projects/:id
 *   POST /internal/tick   (cron / Azure; optional TINGLE_CRON_SECRET)
 *   POST /projects/:id/{first-look,patentability,mute,analyst,tingle,budget,tick,storage,claim,revoke}
 *   GET  /projects/:id/feed
 *
 * Browser UI should call same-origin `/tingle-api` on :3000, not this port
 * directly, or the session cookie is dropped.
 */
loadEnv();

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
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, authorization, x-cron-secret",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = req.method ?? "GET";
  const sid = readCookie(req, SESSION_COOKIE);
  const config = loadTingleConfig();

  try {
    if (method === "GET" && (path === "/" || path === "/health")) {
      json(res, 200, {
        ok: true,
        mock: config.mock,
        collectors: config.collectors,
        llm: Boolean(config.llm),
        llm_model: config.llm?.model ?? null,
      });
      return;
    }

    if (method === "POST" && path === "/internal/tick") {
      if (!cronSecretOk(req)) {
        json(res, 401, { error: "unauthorized" });
        return;
      }
      const summary = await runWatchingTicks(config, {
        afterPersist: (project) => maybeSyncGithub(project, config),
      });
      json(res, 200, { ok: true, ...summary });
      return;
    }

    if (method === "GET" && path === "/auth/providers") {
      json(res, 200, {
        email: true,
        ...oauthProviders(config),
        note: "GitHub/Google login need OAuth app credentials in env. Repo scope is a separate ask at Keep this on my GitHub.",
      });
      return;
    }

    if (method === "GET" && path === "/auth/github") {
      if (!oauthProviders(config).github) {
        json(res, 501, {
          error:
            "GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET. Callback {TINGLE_PUBLIC_URL}/auth/github/callback. Login scope is read:user user:email — not repo.",
        });
        return;
      }
      const purpose = url.searchParams.get("purpose") === "repo" ? "repo" : "login";
      if (purpose === "repo") {
        const u = await userFromSession(sid);
        if (!u) {
          json(res, 401, { error: "not signed in" });
          return;
        }
        const state = newOauthState({
          purpose: "repo",
          userId: u.id,
          projectId: url.searchParams.get("project_id") || undefined,
        });
        redirect(res, githubAuthorizeUrl(config, state, "repo"));
        return;
      }
      const state = newOauthState({ purpose: "login" });
      redirect(res, githubAuthorizeUrl(config, state, "login"));
      return;
    }

    if (method === "GET" && path === "/auth/google") {
      if (!oauthProviders(config).google) {
        json(res, 501, {
          error:
            "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET. Callback {TINGLE_PUBLIC_URL}/auth/google/callback.",
        });
        return;
      }
      const state = newOauthState({ purpose: "login" });
      redirect(res, googleAuthorizeUrl(config, state));
      return;
    }

    if (method === "GET" && path === "/auth/github/callback") {
      await finishOauth(req, res, config, "github", url);
      return;
    }
    if (method === "GET" && path === "/auth/google/callback") {
      await finishOauth(req, res, config, "google", url);
      return;
    }

    if (method === "POST" && path === "/auth/signup") {
      const body = parseBody(EmailPasswordBody, await readJson(req));
      const user = await createUser(body.email, body.password);
      const session = await createSession(user.id);
      setSessionCookie(res, session.id);
      json(res, 201, { id: user.id, email: user.email });
      return;
    }

    if (method === "POST" && path === "/auth/login") {
      const body = parseBody(EmailPasswordBody, await readJson(req));
      const user = await loginUser(body.email, body.password);
      if (!user) {
        json(res, 401, { error: "invalid email or password" });
        return;
      }
      const session = await createSession(user.id);
      setSessionCookie(res, session.id);
      json(res, 200, { id: user.id, email: user.email });
      return;
    }

    if (method === "POST" && path === "/auth/demo") {
      const user = await createDemoUser();
      const session = await createSession(user.id);
      setSessionCookie(res, session.id);
      json(res, 200, { id: user.id, email: user.email, demo: true });
      return;
    }

    if (method === "POST" && path === "/auth/logout") {
      if (sid) await destroySession(sid);
      setSessionCookie(res, "", 0);
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
        storage_default: "vault",
        github_storage_copy: GITHUB_STORAGE_COPY,
      });
      return;
    }

    if (method === "POST" && path === "/first-look") {
      const signedIn = Boolean(await userFromSession(sid));
      assertAnonLookAllowed(req, { mock: config.mock, signedIn });
      const parsed = parseFirstLookRequest(await readJson(req));
      const result = await firstLook(parsed, {
        config,
        client: new BrightDataClient(config),
      });
      json(res, result.status === "needs_confirm" ? 409 : 200, result);
      return;
    }

    if (method === "POST" && path === "/quick-chat") {
      const signedIn = Boolean(await userFromSession(sid));
      assertAnonLookAllowed(req, { mock: config.mock, signedIn });
      const body = parseBody(QuickChatBody, await readJson(req));
      const message = body.message;
      const proposed = proposeClaim({
        pitch: message,
        claim: await polishClaim(message, config.llm),
      });
      const look = await firstLook(
        {
          pitch: message,
          claim: proposed.claim,
          confirmed: true,
          stage: "starting",
          lanes: [],
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
        reply: (
          await answerAnalyst(message, look, { llm: config.llm })
        ).text,
        tingle: false,
      });
      return;
    }

    const user = await userFromSession(sid);
    if (!user) {
      json(res, 401, { error: "not signed in" });
      return;
    }

    if (method === "GET" && path === "/projects") {
      const rows = await listProjects(user.id);
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      json(res, 200, { projects: rows.map(publicProject) });
      return;
    }

    if (method === "POST" && path === "/projects") {
      const body = asRec(await readJson(req));
      const pitch = str(body.pitch) || undefined;
      const claimIn = str(body.claim) || undefined;
      const attachments = parseIncomingAttachments(body.attachments);
      const vision = await understandUploads(attachments, config.llm);
      const docs_text =
        [
          foldAttachmentText(str(body.docs_text) || undefined, attachments),
          vision,
        ]
          .filter((s) => s.trim())
          .join("\n\n") || undefined;
      const proposed = proposeClaim({
        pitch,
        docs_text,
        claim: claimIn || (pitch ? await polishClaim(pitch, config.llm) : undefined),
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
        docs_text,
        links: strs(body.links),
        github_url: str(body.github_url) || undefined,
        watch_list: strs(body.watch_list),
        patent_number: str(body.patent_number) || undefined,
        ignore: strs(body.ignore),
        title: str(body.title) || titleFromClaim(proposed.claim),
        claim: proposed.claim,
        claim_confirmed: false,
        messages: [],
        ...newProjectFields(),
        stealth: body.stealth === true,
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
      /^\/projects\/([^/]+)(?:\/(first-look|patentability|mute|analyst|tingle|feed|tick|budget|revoke|claim|storage))?$/,
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
        if (!project.title?.trim()) project.title = titleFromClaim(claim);
        const planned = 2;
        if (project.paused || wouldExceed(project.budget, planned)) {
          json(res, 402, { error: PAUSE_COPY, budget: project.budget });
          return;
        }
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
            lane: project.budget.lane,
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
        const loads = result.quality.collectors_returned.length;
        project.budget = spend(project.budget, loads);
        if (isCapHit(project.budget)) {
          project.paused = true;
          project.paused_reason = PAUSE_COPY;
        }
        const opener = await answerAnalyst("summarize what you found", result, {
          llm: config.llm,
        });
        project.messages.push({
          id: randomUUID(),
          role: "analyst",
          text: opener.text,
          at: new Date().toISOString(),
          narrated: opener.narrated,
          kind: opener.kind,
        });
        await saveProject(project);
        await maybeSyncGithub(project, config);
        json(res, 200, { project: publicProject(project) });
        return;
      }

      if (method === "POST" && action === "patentability") {
        if (!project.claim_confirmed || !project.claim) {
          json(res, 409, {
            error: "confirm the claim before a patentability scrape",
          });
          return;
        }
        const planned = 2;
        if (project.paused || wouldExceed(project.budget, planned)) {
          json(res, 402, { error: PAUSE_COPY, budget: project.budget });
          return;
        }
        const report = await runPatentability(
          {
            claim: project.claim,
            fingerprints: project.profile?.fingerprints ?? project.last_look?.fingerprints,
            patentNumber: project.patent_number,
          },
          { config },
        );
        project.last_patentability = report;
        project.budget = spend(project.budget, planned);
        if (isCapHit(project.budget)) {
          project.paused = true;
          project.paused_reason = PAUSE_COPY;
        }
        project.messages.push({
          id: randomUUID(),
          role: "analyst",
          text: `${report.verdict_line}\n\n${report.disclaimer}`,
          at: new Date().toISOString(),
          narrated: false,
        });
        await saveProject(project);
        json(res, 200, { project: publicProject(project), report });
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
          const piles = project.last_look.piles;
          const hits = [
            ...piles.stand_on_this,
            ...(piles.local_lane ?? []),
            ...(piles.already_in_the_lane ?? []),
            ...(piles.fast_tracker ?? []),
            ...(piles.shipped_last_7_days ?? []),
            ...(piles.patent_landscape ?? []),
            ...(piles.patent_threats ?? []),
            ...(piles.prior_art_papers ?? []),
            ...(piles.regional_discovered ?? []),
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
        const history = project.messages.slice(-8);
        project.messages.push({
          id: randomUUID(),
          role: "user",
          text: message,
          at: new Date().toISOString(),
        });
        const reply = await answerAnalyst(message, project.last_look, {
          llm: config.llm,
          history,
        });
        project.messages.push({
          id: randomUUID(),
          role: "analyst",
          text: reply.text,
          at: new Date().toISOString(),
          narrated: reply.narrated,
          kind: reply.kind,
        });
        await saveProject(project);
        json(res, 200, {
          project: publicProject(project),
          covered: reply.covered,
          narrated: reply.narrated,
        });
        return;
      }

      if (method === "POST" && action === "tingle") {
        const body = asRec(await readJson(req));
        const on = body.on === true || body.on === "true";
        if (on) {
          const email = str(body.alert_email) || str(body.alert_email) || user.email;
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
        if (Object.prototype.hasOwnProperty.call(body, "webhook_url")) {
          const hook = str(body.webhook_url);
          project.webhook_url = hook || undefined;
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
        if (body.cap !== undefined && body.cap !== null && body.cap !== "") {
          const cap = Number(body.cap);
          if (!Number.isFinite(cap) || cap < 0) {
            json(res, 400, { error: "cap must be a non-negative number" });
            return;
          }
          project.budget = { ...project.budget, cap };
        }
        if (body.lane === "deep" || body.lane === "cheap") {
          project.budget = { ...project.budget, lane: body.lane };
        }
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
        const result = await tingleTick(toTickProject(project), {
          config,
          client: new BrightDataClient(config),
        }, {
          extraRows,
          extraHits,
          autoApproveHeal: process.env.TINGLE_HEAL_AUTO_APPROVE === "1",
        });
        applyTickResult(project, result);
        await saveProject(project);
        await maybeSyncGithub(project, config);
        json(res, 200, {
          project: publicProject(project),
          tick: result,
        });
        return;
      }

      if (method === "POST" && action === "storage") {
        const body = asRec(await readJson(req));
        const backend = str(body.backend);
        if (backend === "vault") {
          project.storage = "vault";
          project.github_token = undefined;
          if (project.profile) project.profile.storage = "vault";
          await saveProject(project);
          json(res, 200, {
            project: publicProject(project),
            copy: "Back on the encrypted vault. GitHub token dropped.",
          });
          return;
        }
        if (backend !== "github") {
          json(res, 400, { error: "backend must be vault or github" });
          return;
        }
        const ref = parseGithubRepoRef(str(body.repo) || project.github_repo || "");
        if (!ref) {
          json(res, 400, { error: "repo required as owner/name (private)" });
          return;
        }
        const token = str(body.token) || project.github_token || "";
        if (!token && !config.mock) {
          json(res, 400, {
            error:
              "GitHub repo token required (fine-grained PAT with contents:write on that private repo, or connect via GET /auth/github?purpose=repo&project_id=…). Login OAuth does not include repo scope.",
          });
          return;
        }
        project.storage = "github";
        project.github_repo = `${ref.owner}/${ref.repo}`;
        project.github_token = token || "mock";
        if (project.profile) {
          project.profile.storage = "github";
          project.profile.github_repo = project.github_repo;
        }
        await saveProject(project);
        const sync = await maybeSyncGithub(project, config);
        json(res, 200, {
          project: publicProject(project),
          copy: GITHUB_STORAGE_COPY,
          sync,
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

    json(res, 404, { error: "not found" });
  } catch (err) {
    if (err instanceof ClientError) {
      json(res, err.status, { error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      json(res, 400, { error: err.issues[0]?.message ?? "invalid body" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      "tingle api 500",
      path,
      redactSecrets(msg, [
        process.env.BRIGHT_DATA_API_TOKEN,
        process.env.AIMLAPI_KEY,
        process.env.TINGLE_LLM_KEY,
      ]),
    );
    json(res, 500, {
      error: process.env.TINGLE_DEBUG_ERRORS === "1" ? msg : "internal error — see server logs",
    });
  }
}

function parseStage(raw: unknown): Stage {
  if (raw === "building" || raw === "shipped" || raw === "starting") return raw;
  return "starting";
}

const server = http.createServer((req, res) => {
  void handleTingleRequest(req, res);
});
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const config = loadTingleConfig();
  void assertDbReadable()
    .then(() => {
      server.listen(config.apiPort, () => {
        console.log(
          `Tingle API http://127.0.0.1:${config.apiPort} mock=${config.mock} llm=${Boolean(config.llm)}`,
        );
      });
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
  const ms = Number(process.env.TINGLE_TICK_MS ?? 15 * 60 * 1000);
  if (ms > 0) {
    startTickLoop(config, (project) => maybeSyncGithub(project, config));
  }
}

async function finishOauth(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  config: TingleConfig,
  provider: "github" | "google",
  url: URL,
) {
  const fail = url.searchParams.get("error");
  if (fail) {
    redirect(
      res,
      `${config.appUrl}/login?oauth_error=${encodeURIComponent(fail)}`,
    );
    return;
  }
  const pending = takeOauthState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code") ?? "";
  if (!pending || !code) {
    json(res, 400, { error: "invalid OAuth state" });
    return;
  }
  try {
    const ident =
      provider === "github"
        ? await exchangeGithub(config, code)
        : await exchangeGoogle(config, code);
    if (pending.purpose === "repo") {
      if (!pending.userId || !pending.projectId || !ident.token) {
        json(res, 400, { error: "repo OAuth did not return a token" });
        return;
      }
      const project = await getProject(pending.userId, pending.projectId);
      if (!project) {
        json(res, 404, { error: "project not found" });
        return;
      }
      project.github_token = ident.token;
      project.storage = "github";
      if (project.profile) project.profile.storage = "github";
      await saveProject(project);
      await maybeSyncGithub(project, config);
      redirect(res, `${config.appUrl}/projects/${project.id}`);
      return;
    }
    const user = await upsertOauthUser(ident);
    const session = await createSession(user.id);
    redirect(res, config.appUrl, sessionCookieHeader(session.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    redirect(
      res,
      `${config.appUrl}/login?oauth_error=${encodeURIComponent(msg)}`,
    );
  }
}

function profileForSync(p: StoredProject): WatchProfile {
  if (p.profile) {
    return {
      ...p.profile,
      storage: p.storage,
      github_repo: p.github_repo,
    };
  }
  return {
    project_id: p.id,
    stage: p.stage,
    claim: p.claim || "unconfirmed",
    fingerprints: [],
    must_match: [],
    ignore: p.ignore,
    sources: ["search", "watch"],
    baseline_ids: [],
    links: p.links,
    watch_list: p.watch_list,
    github_url: p.github_url,
    patent_number: p.patent_number,
    tingle_on: p.tingle_on,
    alert_email: p.alert_email,
    digest_floor: p.digest_floor,
    budget: p.budget,
    paused: p.paused,
    stealth: p.stealth,
    storage: p.storage,
    github_repo: p.github_repo,
  };
}

async function maybeSyncGithub(
  project: StoredProject,
  config: TingleConfig,
): Promise<void> {
  if (project.storage !== "github" || !project.github_repo) return;
  const ref = parseGithubRepoRef(project.github_repo);
  if (!ref) return;
  try {
    await syncTingleTree(
      {
        ...ref,
        token: project.github_token || "mock",
        mock: config.mock || !project.github_token || project.github_token === "mock",
      },
      {
        profile: profileForSync(project),
        baseline: project.last_look?.baseline,
        events: project.events,
        artifacts: project.stealth
          ? undefined
          : { pitch: project.pitch, docs: project.docs_text },
        stealth: project.stealth,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("github .tingle sync failed", project.id, msg);
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
