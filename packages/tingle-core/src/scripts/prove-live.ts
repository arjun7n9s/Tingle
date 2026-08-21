/**
 * Proof: every pinned collector returns schema-valid rows.
 *
 * Runs each configured collector through the same validation gate the product
 * uses. A collector that fails is reported as an extractor incident and parked
 * at the heal approval gate — this script never commits a repair, because a
 * blind approve belongs behind an explicit flag (see prove-heal).
 *
 * Exit code is 1 unless every planned collector came back clean.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { repoRootFromScripts, redact, writeArtifact } from "../artifacts.js";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate, type ScrapeOutcome } from "../bd/scrape.js";
import { planCollectors } from "../collectors.js";
import { loadTingleConfig } from "../config.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = repoRootFromScripts(scriptsDir);
dotenv.config({ path: path.join(root, ".env") });

const config = loadTingleConfig();
const mode = config.mock ? "mock" : "live";
const client = new BrightDataClient(config);

const { plans, skipped } = planCollectors(config);

console.log(`\nTingle collect proof — mode: ${mode.toUpperCase()}`);
if (config.mock) {
  console.log(
    "  Running on fixtures. This exercises the pipeline; it is not evidence\n" +
      "  that a live collector works.",
  );
}
console.log("");

for (const s of skipped) {
  console.log(`  ~ ${s.key.padEnd(6)} skipped — ${s.reason}`);
}
if (!plans.length) {
  console.error(
    "\nNo collectors could run. Pin TINGLE_C_* ids in .env, or set " +
      "TINGLE_MOCK=1 to exercise the pipeline on fixtures.\n",
  );
  process.exit(1);
}

const outcomes: ScrapeOutcome[] = [];
for (const plan of plans) {
  process.stdout.write(`  → ${plan.key.padEnd(6)} ${plan.collectorId} … `);
  const outcome = await scrapeAndValidate(client, {
    collectorId: plan.collectorId,
    source: plan.source,
    inputs: plan.inputs,
    autoApprove: false,
  });
  outcomes.push(outcome);

  if (outcome.hits.length && !outcome.error) {
    console.log(`${outcome.hits.length} valid row(s)${outcome.healed ? " (after heal)" : ""}`);
  } else if (outcome.awaitingApproval) {
    console.log("FAILED — heal proposed, awaiting approval");
  } else {
    console.log(`FAILED — ${outcome.error ?? "no rows"}`);
  }
}

const clean = outcomes.filter((o) => o.hits.length > 0 && !o.error);
const failed = outcomes.filter((o) => !(o.hits.length > 0 && !o.error));

const artifact = await writeArtifact(
  path.join(root, "docs", "proof", "live"),
  "collect",
  redact({
    mode,
    at: new Date().toISOString(),
    claim: config.sampleClaim,
    collectors: plans.map((p) => ({
      key: p.key,
      collector_id: p.collectorId,
      target: p.target,
    })),
    skipped,
    sources_used: clean.map((o) => o.source),
    collectors_failed: failed.map((o) => ({
      source: o.source,
      collector_id: o.collectorId,
      error: o.error,
      awaiting_approval: o.awaitingApproval,
    })),
    results: outcomes.map((o) => ({
      source: o.source,
      collector_id: o.collectorId,
      valid_rows: o.hits.length,
      healed: o.healed,
      awaiting_approval: o.awaitingApproval,
      error: o.error ?? null,
      hits: o.hits,
      heal_events: o.healEvents,
    })),
  }),
);

console.log(`\n  artifact: ${path.relative(root, artifact)}`);
console.log(
  `  ${clean.length}/${outcomes.length} collector(s) clean` +
    (skipped.length ? `, ${skipped.length} skipped` : ""),
);

if (failed.length) {
  console.error("\n  Not a pass. Failing collectors need a heal — see prove:tingle-heal.\n");
  process.exit(1);
}
console.log("  PASS\n");
