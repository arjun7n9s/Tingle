/**
 * Run a first look from the terminal.
 *
 *   npm run first-look -w @tingle/core -- request.json
 *   echo '{...}' | npm run first-look -w @tingle/core
 *
 * Without `confirmed: true` in the request it prints the proposed claim and
 * stops without scraping anything.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { repoRootFromScripts } from "../artifacts.js";
import { loadTingleConfig } from "../config.js";
import { pileLabel, type Piles } from "../piles.js";
import { runFirstLook } from "../jobs/firstLook.js";
import { ProjectStore } from "../store.js";

const root = repoRootFromScripts(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, ".env") });

// npm runs workspace scripts from the package directory, so a path the user
// typed relative to the repo root would not resolve. Try both.
const file = process.argv[2];
const raw = file ? await readRequest(file) : await readStdin();
if (!raw.trim()) {
  console.error("no request supplied — pass a JSON file path or pipe JSON in");
  process.exit(1);
}

const config = loadTingleConfig();
const store = new ProjectStore(path.join(root, ".data"));
const result = await runFirstLook(config, store, JSON.parse(raw));

if (result.status === "needs_confirmation") {
  console.log(`\nProposed claim:\n  ${result.proposed_claim}\n`);
  console.log(`Fingerprints: ${result.fingerprints.slice(0, 8).join(", ")}`);
  console.log(`\n${result.message}\n`);
  process.exit(0);
}

console.log(`\nFirst look — ${config.mock ? "MOCK" : "LIVE"}`);
console.log(`  project : ${result.project_id}`);
console.log(`  claim   : ${result.claim}`);
console.log(`  stage   : ${result.stage}\n`);

for (const key of Object.keys(result.piles) as Array<keyof Piles>) {
  const rows = result.piles[key];
  console.log(`  ${pileLabel(key, rows.length)}`);
  for (const h of rows.slice(0, 6)) {
    console.log(`    · ${h.title}`);
    console.log(`      ${h.url}`);
    console.log(`      ${h.origin} · ${h.reason}`);
  }
  console.log("");
}

console.log("  Sources used this turn");
for (const s of result.sources) {
  const state = s.ok
    ? `${s.rows} row(s)`
    : `did not return — ${s.error ?? "unknown"}${
        s.awaiting_approval ? " [heal awaiting review]" : ""
      }`;
  console.log(`    ${s.kind === "collector" ? "collector" : "adjunct  "} ${s.name.padEnd(18)} ${state}`);
}

const q = result.quality;
console.log(
  `\n  ${q.kept}/${q.hits_in} hits kept · ${q.below_threshold} below threshold · ` +
    `${q.ignored} muted · ${q.undated} undated`,
);
console.log(
  `  collectors ${q.collectors_ok}/${q.collectors_total} · adjuncts ${q.adjuncts_ok}/${q.adjuncts_total} · ` +
    `baseline ${result.baseline_size} entries · ${result.spent.collector_runs} collector run(s)`,
);
if (result.collectors_failed.length) {
  console.log(
    `\n  Collectors that did not return: ${result.collectors_failed
      .map((c) => c.name)
      .join(", ")} — reported, not filled in.`,
  );
}
console.log("");

async function readRequest(p: string): Promise<string> {
  for (const candidate of [p, path.resolve(process.cwd(), p), path.join(root, p)]) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      /* try the next location */
    }
  }
  throw new Error(`could not read request file: ${p}`);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
