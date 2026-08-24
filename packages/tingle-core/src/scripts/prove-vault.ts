import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { handleTingleRequest } from "../http.js";
import { loadEnv } from "../config.js";
import { dbFilePath } from "../store.js";
import { resetMasterCache } from "../vault.js";

loadEnv();
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tingle-vault-"));
process.env.TINGLE_DATA_DIR = dataDir;
process.env.TINGLE_VAULT_MASTER = "cd".repeat(32);
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

const canary = `vault-canary-${Date.now()}-xyzzy`;
const pitch = `a watch that tells indie builders when someone else ships their idea — ${canary}`;
const email = `prove-vault-${Date.now()}@example.com`;

const signup = await call("/auth/signup", {
  method: "POST",
  body: JSON.stringify({ email, password: "password1" }),
});
if (signup.status !== 201) fail("signup failed", signup);

const me = await call("/me");
if (!/plaintext pitch/i.test(String(me.body.vault_promise ?? ""))) {
  fail("vault promise missing on /me", me);
}

const created = await call("/projects", {
  method: "POST",
  body: JSON.stringify({
    stage: "starting",
    extra_question: "Keep this private",
    stealth: true,
    pitch,
  }),
});
if (created.status !== 201) fail("create failed", created);
if (created.body.project.stealth !== true) fail("stealth not set", created);
const projectId = created.body.project.id as string;

const look = await call(`/projects/${projectId}/first-look`, {
  method: "POST",
  body: JSON.stringify({
    claim: created.body.proposed_claim,
    confirmed: true,
  }),
});
if (look.status !== 200) fail("first look failed — jobs must still run", look);
if (!look.body.project.last_look) fail("first look returned no piles", look);

const dump = await fs.readFile(dbFilePath(), "utf8");
if (dump.includes(canary) || dump.includes(pitch)) {
  fail("DB dump still contains the raw pitch", dump.slice(0, 400));
}
if (!/"vault"\s*:/.test(dump)) fail("project is not vaulted on disk", dump.slice(0, 400));
if (!dump.includes(email)) fail("email should remain in the clear", dump.slice(0, 200));

const owner = await call(`/projects/${projectId}`);
if (!String(owner.body.project.claim ?? "").includes("indie builders")) {
  fail("owner should still see the claim while a job is in play", owner);
}

const revoked = await call(`/projects/${projectId}/revoke`, { method: "POST" });
if (revoked.status !== 200) fail("revoke failed", revoked);
const leftover = revoked.body.leftover as {
  email: string;
  budget: { cap: number; spent: number };
  collectors: string[];
};
if (leftover.email !== email) fail("revoke lost email", leftover);
if (!leftover.budget || leftover.collectors.length === 0) {
  fail("revoke should leave budget + c_*", leftover);
}

const dump2 = await fs.readFile(dbFilePath(), "utf8");
if (dump2.includes(canary) || dump2.includes(pitch)) {
  fail("dump after revoke still has the pitch", dump2.slice(0, 400));
}
if (/"claim"\s*:\s*"a watch/i.test(dump2)) {
  fail("plaintext claim survived revoke", dump2.slice(0, 400));
}

const after = await call(`/projects/${projectId}`);
if (after.body.project.claim) fail("revoked project still exposes claim", after);
if (after.body.project.revoked !== true) fail("revoked flag missing", after);

const blocked = await call(`/projects/${projectId}/tick`, {
  method: "POST",
  body: JSON.stringify({}),
});
if (blocked.status !== 410) fail("revoked project should not tick", blocked);

server.close();
await fs.rm(dataDir, { recursive: true, force: true });
console.log("prove:tingle-vault PASS");
console.log(`canary_absent_from_dump=true`);
console.log(`jobs_ran=true`);
console.log(`leftover_email=${leftover.email}`);
console.log(`leftover_collectors=${leftover.collectors.join(",")}`);
console.log(`budget_spent=${leftover.budget.spent}`);
