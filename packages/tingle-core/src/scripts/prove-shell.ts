import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { handleTingleRequest } from "../http.js";
import { loadEnv } from "../config.js";
import { resetMasterCache } from "../vault.js";

loadEnv();
process.env.TINGLE_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "tingle-shell-"));
process.env.TINGLE_VAULT_MASTER = "ab".repeat(32);
process.env.TINGLE_MOCK = "1";
process.env.BRIGHT_DATA_API_TOKEN = "";
process.env.BRIGHT_DATA_API_TOKEN_2 = "";
process.env.BRIGHTDATA_API_KEY = "";
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
    headers.set("Cookie", [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
  }
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
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

const email = `prove-${Date.now()}@example.com`;
const signup = await call("/auth/signup", {
  method: "POST",
  body: JSON.stringify({ email, password: "password1" }),
});
if (signup.status !== 201) {
  console.error(signup);
  process.exit(1);
}

const created = await call("/projects", {
  method: "POST",
  body: JSON.stringify({
    stage: "starting",
    pitch: "a watch that tells indie builders when someone else ships their idea",
  }),
});
if (created.status !== 201) {
  console.error(created);
  process.exit(1);
}
const projectId = created.body.project.id as string;
const look = await call(`/projects/${projectId}/first-look`, {
  method: "POST",
  body: JSON.stringify({
    claim: created.body.proposed_claim,
    confirmed: true,
  }),
});
if (look.status !== 200 || !look.body.project.last_look) {
  console.error(look);
  process.exit(1);
}

const searchQ = await call(`/projects/${projectId}/analyst`, {
  method: "POST",
  body: JSON.stringify({ message: "what did Search return?" }),
});
const market = await call(`/projects/${projectId}/analyst`, {
  method: "POST",
  body: JSON.stringify({ message: "who will win the market?" }),
});

server.close();

const searchText = String(searchQ.body.project.messages.at(-1)?.text ?? "");
const marketText = String(market.body.project.messages.at(-1)?.text ?? "");
const piles = look.body.project.last_look.piles;
const hasPiles =
  "stand_on_this" in piles &&
  "already_in_the_lane" in piles &&
  "shipped_last_7_days" in piles;

if (!hasPiles) {
  console.error("FAIL: missing piles");
  process.exit(1);
}
if (market.body.covered !== false || !/do not invent|don't have a tool/i.test(marketText)) {
  console.error("FAIL: market question was not refused", market);
  process.exit(1);
}
if (!/search/i.test(searchText)) {
  console.error("FAIL: search follow-up empty", searchText);
  process.exit(1);
}
console.log("prove:tingle-shell PASS");
console.log(`project=${projectId}`);
console.log(`piles=${JSON.stringify(look.body.project.last_look.quality.hit_count_per_pile)}`);
console.log(`search_followup_ok=${searchQ.status === 200}`);
console.log(`market_refused=${market.body.covered === false}`);
