/**
 * Proof: a broken extractor repairs itself in place, and the collector id does
 * not change.
 *
 * This is the claim that matters. Everything downstream holds a collector id;
 * if a repair issued a new one, every schedule and caller would break. So the
 * assertion is not just "rows came back" — it is "rows came back from the same
 * id, with no application code change".
 *
 * Mock mode forces the broken-DOM path. Live mode expects the hosted fixture
 * to already be serving broken.html (see fixtures/tingle-chaos/README.md).
 *
 * Runs with autoApprove — the one place that flag is appropriate, since the
 * whole point is an unattended round trip.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { repoRootFromScripts, redact, writeArtifact } from "../artifacts.js";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import { planCollectors } from "../collectors.js";
import { loadTingleConfig } from "../config.js";
import type { HealEvent } from "../schema/events.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = repoRootFromScripts(scriptsDir);
dotenv.config({ path: path.join(root, ".env") });

const config = loadTingleConfig();
const mode = config.mock ? "mock" : "live";
const client = new BrightDataClient(config);

const { plans, skipped } = planCollectors(config, { only: ["chaos"] });
const chaos = plans[0];

console.log(`\nTingle heal proof — mode: ${mode.toUpperCase()}`);
if (!chaos) {
  console.error(
    `\n  Cannot run: ${skipped[0]?.reason ?? "chaos collector not configured"}\n`,
  );
  process.exit(1);
}

const idBefore = chaos.collectorId;
console.log(`  collector: ${idBefore}`);
console.log(`  target:    ${chaos.target}`);
if (config.mock) {
  console.log("  forcing the broken-DOM path on fixtures");
} else {
  console.log("  expecting the hosted fixture to be serving broken.html");
}
console.log("");

const timeline: HealEvent[] = [];
const outcome = await scrapeAndValidate(client, {
  collectorId: idBefore,
  source: chaos.source,
  inputs: chaos.inputs,
  forceBreak: true,
  autoApprove: true,
  onHealEvent: (e) => {
    timeline.push(e);
    console.log(`  ${e.stage.padEnd(22)} ${firstLine(e.detail)}`);
  },
});

// ── assertions ─────────────────────────────────────────────────────────────
const idsSeen = [...new Set(timeline.map((e) => e.collector_id))];
const stages = timeline.map((e) => e.stage);

const checks = [
  {
    name: "validation caught the break",
    pass: stages.includes("validation_failed"),
  },
  {
    name: "heal prompt built from validation issues",
    pass: timeline.some(
      (e) => e.stage === "heal_started" && (e.zod_issues?.length ?? 0) > 0,
    ),
  },
  { name: "retry ran", pass: stages.includes("retry_started") },
  { name: "retry recovered valid rows", pass: stages.includes("retry_succeeded") },
  { name: "rows are schema-valid", pass: outcome.hits.length > 0 && !outcome.error },
  {
    name: "collector id unchanged throughout",
    pass: idsSeen.length === 1 && idsSeen[0] === idBefore,
  },
];

console.log("");
for (const c of checks) {
  console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
}

const artifact = await writeArtifact(
  path.join(root, "docs", "proof", "heal"),
  "heal",
  redact({
    mode,
    at: new Date().toISOString(),
    collector_id_before: idBefore,
    collector_id_after: outcome.collectorId,
    collector_ids_seen: idsSeen,
    target: chaos.target,
    checks,
    healed: outcome.healed,
    valid_rows_after_heal: outcome.hits.length,
    error: outcome.error ?? null,
    heal_timeline: timeline,
    hits: outcome.hits,
  }),
);

console.log(`\n  artifact: ${path.relative(root, artifact)}`);

if (checks.every((c) => c.pass)) {
  console.log(
    `  PASS — repaired in place, collector id still ${idBefore}, no code change\n`,
  );
} else {
  console.error("\n  FAIL — see the checks above\n");
  process.exit(1);
}

function firstLine(s: string): string {
  const line = s.split("\n")[0] ?? "";
  return line.length > 96 ? `${line.slice(0, 93)}…` : line;
}
