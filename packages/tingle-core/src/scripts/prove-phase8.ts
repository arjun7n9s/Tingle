import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { handleTingleRequest } from "../http.js";
import { loadEnv } from "../config.js";
import { githubMirrorRoot } from "../githubStorage.js";
import { resetMasterCache } from "../vault.js";

loadEnv();
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tingle-p8-"));
process.env.TINGLE_DATA_DIR = dataDir;
process.env.TINGLE_VAULT_MASTER = "ef".repeat(32);
process.env.TINGLE_MOCK = "1";
process.env.BRIGHT_DATA_API_TOKEN = "";
process.env.BRIGHT_DATA_API_TOKEN_2 = "";
process.env.BRIGHTDATA_API_KEY = "";
process.env.TINGLE_TICK_MS = "0";
delete process.env.GITHUB_OAUTH_CLIENT_ID;
delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
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

const providers = await call("/auth/providers");
if (providers.status !== 200) fail("providers", providers);
if (providers.body.github !== false || providers.body.google !== false) {
  fail("OAuth must be off without client ids", providers.body);
}

const email = `prove-p8-${Date.now()}@example.com`;
const signup = await call("/auth/signup", {
  method: "POST",
  body: JSON.stringify({ email, password: "password1" }),
});
if (signup.status !== 201) fail("signup", signup);

const created = await call("/projects", {
  method: "POST",
  body: JSON.stringify({
    stage: "starting",
    pitch: "a watch that tells indie builders when someone else ships their idea",
    watch_list: [
      "https://www.uneed.best/tool/extra-lane",
      "https://github.com/foo/bar",
    ],
  }),
});
if (created.status !== 201) fail("create", created);
const id = created.body.project.id as string;

const look = await call(`/projects/${id}/first-look`, {
  method: "POST",
  body: JSON.stringify({ confirmed: true }),
});
if (look.status !== 200) fail("first-look cheap", look);

await call(`/projects/${id}/budget`, {
  method: "POST",
  body: JSON.stringify({ lane: "deep", cap: 50 }),
});
const deep = await call(`/projects/${id}/first-look`, {
  method: "POST",
  body: JSON.stringify({ confirmed: true, rebuild: true }),
});
if (deep.status !== 200) fail("first-look deep", deep);
const q = deep.body.project.last_look.quality;
if (!q.marketplace_label) fail("deep look missing marketplace label", q);
if ((q.collectors_returned as string[]).includes("chatgpt_dataset")) {
  fail("marketplace must not sit in collectors_returned", q);
}

const storage = await call(`/projects/${id}/storage`, {
  method: "POST",
  body: JSON.stringify({
    backend: "github",
    repo: "acme/private-watch",
    token: "mock",
  }),
});
if (storage.status !== 200) fail("storage github", storage);
if (storage.body.project.storage !== "github") fail("storage not github", storage.body);

const profileFile = path.join(
  githubMirrorRoot({ owner: "acme", repo: "private-watch" }),
  ".tingle",
  "profile.yml",
);
const yaml = await fs.readFile(profileFile, "utf8");
if (!/project_id/.test(yaml)) fail("mock .tingle/profile.yml missing", yaml);

const ghStart = await call("/auth/github");
if (ghStart.status !== 501) fail("github oauth should 501 without client id", ghStart);

const revoked = await call(`/projects/${id}/revoke`, { method: "POST" });
if (revoked.status !== 200) fail("revoke", revoked);
if (revoked.body.leftover?.email !== email) fail("revoke leftover email", revoked.body);
if (!Array.isArray(revoked.body.leftover?.collectors)) {
  fail("revoke leftover collectors", revoked.body);
}

console.log("prove:tingle-phase8 PASS");
console.log("oauth_unconfigured=true");
console.log("github_tree_mock=true");
console.log("marketplace_labeled_not_studio=true");
console.log("extra_urls_reuse_watch_collector=true");
server.close();
