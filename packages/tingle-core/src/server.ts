import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { askAnalyst } from "./analyst.js";
import {
  clearCookie,
  hashPassword,
  newSession,
  newUser,
  parseCookies,
  passwordProblem,
  sessionCookie,
  verifyPassword,
  COOKIE,
  type User,
} from "./auth.js";
import { loadTingleConfig } from "./config.js";
import { runFirstLook } from "./jobs/firstLook.js";
import { ProjectStore } from "./store.js";
import {
  homePage,
  loginPage,
  newProjectPage,
  projectPage,
  quickChatPage,
  signupPage,
} from "./views.js";

/**
 * The product shell: email sign-in, two doors, a project page, and a tool-gated
 * analyst. Server-rendered from `node:http` on purpose — the point of this phase
 * is that the pipeline is usable, and a framework would not make it more so.
 */
export function createTingleServer(opts: { dataDir?: string } = {}) {
  const config = loadTingleConfig();
  const store = new ProjectStore(
    opts.dataDir ?? path.resolve(process.cwd(), ".data"),
  );

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;

    const html = (code: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(code, {
        "Content-Type": "text/html; charset=utf-8",
        ...headers,
      });
      res.end(body);
    };
    const json = (code: number, body: unknown, headers: Record<string, string> = {}) => {
      const s = JSON.stringify(body, null, 2);
      res.writeHead(code, { "Content-Type": "application/json", ...headers });
      res.end(s);
    };
    const redirect = (to: string, headers: Record<string, string> = {}) => {
      res.writeHead(302, { Location: to, ...headers });
      res.end();
    };

    const user = await currentUser(req, store);

    try {
      // ── JSON API, kept from phase 2 so the pipeline stays drivable ───────
      if (p === "/health" && req.method === "GET") {
        return json(200, {
          ok: true,
          mode: config.mock ? "mock" : "live",
          collectors: {
            search: Boolean(config.collectors.search),
            watch: Boolean(config.collectors.watch),
            chaos: Boolean(config.collectors.chaos),
          },
        });
      }
      if (p === "/first-look" && req.method === "POST") {
        return json(200, await runFirstLook(config, store, await readJson(req)));
      }

      // ── auth ─────────────────────────────────────────────────────────────
      if (p === "/signup") {
        if (req.method === "GET") return html(200, signupPage());
        const f = await readForm(req);
        const email = (f.email ?? "").trim().toLowerCase();
        const pw = f.password ?? "";
        const problem = passwordProblem(pw);
        if (!email.includes("@")) return html(400, signupPage("that email does not look right"));
        if (problem) return html(400, signupPage(problem));
        try {
          const { hash, salt } = await hashPassword(pw);
          const u = newUser(email, hash, salt);
          await store.addUser(u);
          const s = newSession(u.id);
          await store.addSession(s);
          return redirect("/", { "Set-Cookie": sessionCookie(s.token) });
        } catch (err) {
          return html(400, signupPage(msg(err)));
        }
      }

      if (p === "/login") {
        if (req.method === "GET") return html(200, loginPage());
        const f = await readForm(req);
        const found = await store.findUserByEmail(f.email ?? "");
        const ok =
          found &&
          (await verifyPassword(
            f.password ?? "",
            found.password_hash,
            found.password_salt,
          ));
        // Same message either way — telling someone which half was wrong tells
        // them whether an account exists.
        if (!ok) return html(401, loginPage("email or password is wrong"));
        const s = newSession(found!.id);
        await store.addSession(s);
        return redirect("/", { "Set-Cookie": sessionCookie(s.token) });
      }

      if (p === "/logout" && req.method === "POST") {
        const token = parseCookies(req.headers.cookie)[COOKIE];
        if (token) await store.removeSession(token);
        return redirect("/login", { "Set-Cookie": clearCookie() });
      }

      if (!user) return redirect("/login");

      // ── home ─────────────────────────────────────────────────────────────
      if (p === "/" && req.method === "GET") {
        return html(200, homePage(user.email, await store.listProjects(user.id)));
      }

      // ── quick chat: no memory, no watch, no project ───────────────────────
      if (p === "/quick-chat") {
        if (req.method === "GET") return html(200, quickChatPage({ email: user.email }));
        const f = await readForm(req);
        const q = (f.q ?? "").trim();
        if (!q) {
          return html(400, quickChatPage({ email: user.email, error: "say something first" }));
        }
        const result = await runFirstLook(config, store, {
          // A throwaway id keeps quick chat out of the project list entirely.
          project_id: `quick-${Date.now()}`,
          input: { stage: "starting", pitch: q, docs: [], links: [], watch_list: [], ignore: [] },
          persist: false,
          claim: firstSentence(q),
          confirmed: true,
        });
        return html(200, quickChatPage({ email: user.email, question: q, result }));
      }

      // ── new project ──────────────────────────────────────────────────────
      if (p === "/new-project") {
        if (req.method === "GET") return html(200, newProjectPage({ email: user.email }));
        const f = await readForm(req);
        const input = {
          stage: (f.stage as "starting" | "building" | "shipped") ?? "starting",
          pitch: f.pitch ?? "",
          docs: [],
          links: lines(f.links),
          github_repo: f.github_repo?.trim() || undefined,
          watch_list: [],
          ignore: lines(f.ignore),
        };
        const confirmed = f.confirmed === "1";
        try {
          const result = await runFirstLook(config, store, {
            input,
            claim: f.claim?.trim() || undefined,
            confirmed,
          });
          if (result.status === "needs_confirmation") {
            return html(
              200,
              newProjectPage({
                email: user.email,
                proposed: result.proposed_claim,
                fingerprints: result.fingerprints,
                form: f,
              }),
            );
          }
          await store.claimProject(user.id, result.project_id);
          await store.saveLastLook(result.project_id, result);
          return redirect(`/project/${result.project_id}`);
        } catch (err) {
          return html(400, newProjectPage({ email: user.email, error: msg(err), form: f }));
        }
      }

      // ── project ──────────────────────────────────────────────────────────
      const projectMatch = p.match(/^\/project\/([^/]+)(\/ask|\/mute)?$/);
      if (projectMatch) {
        const id = decodeURIComponent(projectMatch[1]!);
        if (!(await store.ownsProject(user.id, id))) return html(404, notFound());
        const profile = await store.loadProfile(id);
        if (!profile) return html(404, notFound());
        const look = await store.loadLastLook(id);

        if (projectMatch[2] === "/ask" && req.method === "POST") {
          const f = await readForm(req);
          const question = (f.question ?? "").trim();
          const hits = look
            ? [
                ...look.piles.stand_on_this,
                ...look.piles.already_in_the_lane,
                ...look.piles.shipped_last_7_days,
              ]
            : [];
          const answer = askAnalyst(
            { claim: profile.claim, hits, sources: look?.sources ?? [] },
            question,
          );
          return html(200, projectPage({ email: user.email, profile, look, answer, question }));
        }

        if (projectMatch[2] === "/mute" && req.method === "POST") {
          const f = await readForm(req);
          const target = (f.url ?? "").trim();
          if (target && !profile.ignore.includes(target)) {
            // Muting writes to the profile so the hit cannot reappear as a new
            // event on the next run. It does not re-run anything now.
            await store.saveProfile({
              ...profile,
              ignore: [...profile.ignore, target],
              updated_at: new Date().toISOString(),
            });
          }
          return redirect(`/project/${encodeURIComponent(id)}`);
        }

        if (req.method === "GET") {
          return html(200, projectPage({ email: user.email, profile, look }));
        }
      }

      return html(404, notFound());
    } catch (err) {
      return html(500, notFound(msg(err)));
    }
  });
}

async function currentUser(
  req: IncomingMessage,
  store: ProjectStore,
): Promise<User | null> {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const session = await store.findSession(token);
  if (!session) return null;
  return store.findUserById(session.user_id);
}

function notFound(detail?: string): string {
  return `<!DOCTYPE html><meta charset="utf-8"><title>Not found</title>
    <body style="font:15px system-ui;background:#0c0f16;color:#e6ebf5;padding:2rem">
    <p>Nothing here. <a href="/" style="color:#5ee6a8">Home</a></p>
    ${detail ? `<pre style="color:#ffb3ad">${detail.replace(/</g, "&lt;")}</pre>` : ""}</body>`;
}

function lines(s?: string): string[] {
  return (s ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function firstSentence(s: string): string {
  const one = s.trim().split(/(?<=[.!?])\s+/)[0] ?? s;
  const w = one.split(/\s+/);
  return w.length > 30 ? `${w.slice(0, 30).join(" ")}…` : one;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readRaw(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > 2_000_000) throw new Error("request body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req: IncomingMessage): Promise<any> {
  const raw = await readRaw(req);
  if (!raw.trim()) throw new Error("empty request body");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("request body is not valid JSON");
  }
}

async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const raw = await readRaw(req);
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}
