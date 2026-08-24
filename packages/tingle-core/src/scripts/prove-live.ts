import fs from "node:fs/promises";
import path from "node:path";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import { loadEnv, loadTingleConfig, type CollectorKey } from "../config.js";
import { repoRoot } from "../paths.js";

loadEnv();
const config = loadTingleConfig();
const client = new BrightDataClient(config);
const root = repoRoot();
const outDir = path.join(root, "docs", "proof", "tingle", "live");
await fs.mkdir(outDir, { recursive: true });

const keys: CollectorKey[] = ["search", "watch", "chaos"];
const collectors: Record<string, unknown> = {};
const failures: string[] = [];

for (const key of keys) {
  const outcome = await scrapeAndValidate(client, config, key, {
    autoApprove: false,
  });
  collectors[key] = {
    stored_as_success: outcome.stored_as_success,
    healed: outcome.healed,
    row_count: outcome.rows.length,
    error: outcome.error,
    rows: outcome.stored_as_success ? outcome.rows : [],
    heal_events: outcome.healEvents,
  };
  if (!outcome.stored_as_success) {
    failures.push(`${key}: ${outcome.error ?? "validation failed"}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const payload = {
  mode: config.mock ? "mock" : "live",
  at: new Date().toISOString(),
  collectors,
};
const outFile = path.join(outDir, `live-${stamp}.json`);
await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

console.log(`Wrote ${outFile}`);
console.log(`mode=${payload.mode}`);
for (const key of keys) {
  const c = collectors[key] as { stored_as_success: boolean; row_count: number };
  console.log(`${key}: success=${c.stored_as_success} rows=${c.row_count}`);
}

if (failures.length) {
  console.error(`FAIL: ${failures.join(" | ")}`);
  process.exit(1);
}
console.log("prove:tingle-live PASS");
if (config.mock) {
  console.log(
    "Note: mock is not evidence of Scraper Studio usage. Pin live TINGLE_C_* to prove eligibility.",
  );
}
