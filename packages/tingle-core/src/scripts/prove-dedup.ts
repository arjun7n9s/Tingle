import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { handleTingleRequest } from "../http.js";
import { loadEnv } from "../config.js";
import { resetMasterCache } from "../vault.js";

loadEnv();
process.env.TINGLE_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "tingle-dedup-"));
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

async function call(p: string, init: RequestInit = {}) {
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
  const res = await fetch(`${base}${p}`, { ...init, headers });
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

const email = `prove-dedup-${Date.now()}@example.com`;
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
if (created.status !== 201) fail("create failed", created);
const projectId = created.body.project.id as string;

const look = await call(`/projects/${projectId}/first-look`, {
  method: "POST",
  body: JSON.stringify({
    claim: created.body.proposed_claim,
    confirmed: true,
  }),
});
if (look.status !== 200) fail("first look failed", look);
const lockedClaim = look.body.project.claim as string;
const fingerprints = look.body.project.last_look.fingerprints as string[];

const on = await call(`/projects/${projectId}/tingle`, {
  method: "POST",
  body: JSON.stringify({ on: true, alert_email: email }),
});
if (on.status !== 200) fail("switch failed", on);

const tick1 = await call(`/projects/${projectId}/tick`, {
  method: "POST",
  body: JSON.stringify({ cluster_fixture: true }),
});
const ev = tick1.body.tick?.events?.[0];
if (tick1.body.tick?.new_event_count !== 1) {
  fail("expected one clustered event, not a reprint per source", tick1.body.tick);
}
if (!ev || ev.sources?.length !== 3) {
  fail("expected three sources on one event", ev);
}

const muted = await call(`/projects/${projectId}/mute`, {
  method: "POST",
  body: JSON.stringify({ title: "TwinLane" }),
});
if (muted.status !== 200) fail("mute failed", muted);

const tick2 = await call(`/projects/${projectId}/tick`, {
  method: "POST",
  body: JSON.stringify({ cluster_fixture: true }),
});
if (tick2.body.tick?.new_event_count !== 0) {
  fail("mute did not survive the next tick", tick2.body.tick);
}

const sneak = await call(`/projects/${projectId}/claim`, {
  method: "POST",
  body: JSON.stringify({
    claim: "a totally different sentence about roasting coffee",
  }),
});
if (sneak.body.job_changed !== false) fail("unconfirmed claim edit changed the job", sneak);
const still = await call(`/projects/${projectId}`);
if (still.body.project.claim !== lockedClaim) {
  fail("locked claim moved without rebuild", still.body.project);
}

const blockedLook = await call(`/projects/${projectId}/first-look`, {
  method: "POST",
  body: JSON.stringify({
    claim: "a totally different sentence about roasting coffee",
    confirmed: true,
  }),
});
if (blockedLook.status !== 409 || blockedLook.body.status !== "claim_locked") {
  fail("first-look retargeted without rebuild", blockedLook);
}
const after = await call(`/projects/${projectId}`);
if (JSON.stringify(after.body.project.last_look.fingerprints) !== JSON.stringify(fingerprints)) {
  fail("fingerprints changed without rebuild", after.body.project.last_look.fingerprints);
}

server.close();
console.log("prove:tingle-dedup PASS");
console.log(`event_sources=${ev.sources.map((s: { collector: string }) => s.collector).join(",")}`);
console.log(`mute_survived=true`);
console.log(`claim_locked=true`);
