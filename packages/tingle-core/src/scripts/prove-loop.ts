import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { handleTingleRequest } from "../http.js";
import { loadEnv } from "../config.js";
import { resetMasterCache } from "../vault.js";

loadEnv();
process.env.TINGLE_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "tingle-loop-"));
process.env.TINGLE_VAULT_MASTER = "ab".repeat(32);
process.env.TINGLE_MOCK = "1";
process.env.BRIGHT_DATA_API_TOKEN = "";
process.env.BRIGHT_DATA_API_TOKEN_2 = "";
process.env.BRIGHTDATA_API_KEY = "";
process.env.TINGLE_TICK_MS = "0";
resetMasterCache();

const server = http.createServer((req, res) => {
  void handleTingleRequest(req, res);
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
if (!addr || typeof addr === "string") throw new Error("no port");
const base = `http://127.0.0.1:${addr.port}`;

const jar = new Map<string, string>();

async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (jar.size) {
    headers.set(
      "Cookie",
      [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    );
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [nv] = c.split(";");
    const eq = nv.indexOf("=");
    if (eq > 0) jar.set(nv.slice(0, eq), nv.slice(eq + 1));
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function fail(msg: string, extra?: unknown): never {
  console.error(msg, extra ?? "");
  process.exit(1);
}

const email = `prove-loop-${Date.now()}@example.com`;
const signup = await call("/auth/signup", {
  method: "POST",
  body: JSON.stringify({ email, password: "password1" }),
});
if (signup.status !== 201) fail("signup failed", signup);

const created = await call("/projects", {
  method: "POST",
  body: JSON.stringify({
    stage: "starting",
    pitch: "a watch that tells indie builders when someone else ships their idea",
  }),
});
if (created.status !== 201) fail("create project failed", created);
const projectId = created.body.project.id as string;

const look = await call(`/projects/${projectId}/first-look`, {
  method: "POST",
  body: JSON.stringify({
    claim: created.body.proposed_claim,
    confirmed: true,
  }),
});
if (look.status !== 200) fail("first look failed", look);

const switchOn = await call(`/projects/${projectId}/tingle`, {
  method: "POST",
  body: JSON.stringify({ on: true, alert_email: email }),
});
if (switchOn.status !== 200 || switchOn.body.project.tingle_on !== true) {
  fail("tingle switch failed", switchOn);
}

const tick1 = await call(`/projects/${projectId}/tick`, {
  method: "POST",
  body: JSON.stringify({ inject_new_watch: true }),
});
if (tick1.status !== 200) fail("tick 1 failed", tick1);
const t1 = tick1.body.tick;
if (t1.transport !== "POST /dca/trigger") fail("tick is not POST /dca/trigger", t1);
if (t1.new_event_count !== 1) fail("expected one new event, not a reprint", t1);
if (t1.reprint) fail("tick reprinted the baseline", t1);
if (!t1.mail?.some((m: { urgency: string }) => m.urgency === "now")) {
  fail("Now event did not send email", t1);
}

const tick2 = await call(`/projects/${projectId}/tick`, {
  method: "POST",
  body: JSON.stringify({ inject_new_watch: true }),
});
if (tick2.body.tick.new_event_count !== 0) {
  fail("second tick reprinted or re-emitted", tick2.body.tick);
}

const spent = tick2.body.project.budget.spent as number;
const cap = await call(`/projects/${projectId}/budget`, {
  method: "POST",
  body: JSON.stringify({ cap: spent }),
});
if (cap.status !== 200) fail("set cap failed", cap);

const tick3 = await call(`/projects/${projectId}/tick`, {
  method: "POST",
  body: JSON.stringify({ inject_new_watch: true }),
});
if (tick3.body.tick.status !== "paused" || tick3.body.tick.page_loads !== 0) {
  fail("cap hit did not pause the worker", tick3.body.tick);
}
if (
  !/paused because it exceeded its budget/i.test(
    String(tick3.body.project.paused_reason ?? ""),
  )
) {
  fail("missing pause copy", tick3.body.project);
}

const feed = await call(`/projects/${projectId}/feed`);
if (feed.status !== 200 || feed.body.events.length !== 1) {
  fail("feed should hold the one event", feed);
}

server.close();
console.log("prove:tingle-loop PASS");
console.log(`project=${projectId}`);
console.log(`events=${feed.body.events.length}`);
console.log(`now_mail=${t1.mail.filter((m: { urgency: string }) => m.urgency === "now").length}`);
console.log(`transport=${t1.transport}`);
console.log(`paused=${tick3.body.project.paused}`);
