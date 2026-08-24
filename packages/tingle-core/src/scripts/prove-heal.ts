import fs from "node:fs/promises";
import path from "node:path";
import { BrightDataClient } from "../bd/client.js";
import { scrapeAndValidate } from "../bd/scrape.js";
import { buildChaosDualSelectorHealPrompt } from "../bd/validate.js";
import {
  chaosBrokenUrl,
  loadEnv,
  loadTingleConfig,
} from "../config.js";
import { repoRoot } from "../paths.js";

loadEnv();
const autoApprove =
  process.argv.includes("--auto-approve") ||
  process.env.TINGLE_HEAL_AUTO_APPROVE === "1";

const config = loadTingleConfig();
const client = new BrightDataClient(config);
const root = repoRoot();
const outDir = path.join(root, "docs", "proof", "tingle", "heal");
await fs.mkdir(outDir, { recursive: true });

const collectorBefore = config.collectors.chaos ?? "mock_chaos";
const brokenUrl = chaosBrokenUrl(config);

const healthy = await scrapeAndValidate(client, config, "chaos", {
  forceChaosBreak: false,
  autoApprove: false,
});

const broken = await scrapeAndValidate(client, config, "chaos", {
  forceChaosBreak: true,
  url: config.mock ? undefined : brokenUrl,
  healPrompt: config.mock
    ? undefined
    : buildChaosDualSelectorHealPrompt([
        "empty title/snippet — selectors moved from .claim-title/.hit-snippet to .product-heading/.tagline-text",
      ]),
  autoApprove: autoApprove || config.mock,
});

let restored:
  | Awaited<ReturnType<typeof scrapeAndValidate>>
  | undefined;
if (!config.mock && broken.stored_as_success) {
  restored = await scrapeAndValidate(client, config, "chaos", {
    autoApprove: false,
  });
}

const collectorAfter = broken.healEvents[0]?.collector_id ?? collectorBefore;
const sameId = collectorBefore === collectorAfter;
const healed = broken.healEvents.some((e) => e.stage === "retry_succeeded");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const payload = {
  mode: config.mock ? "mock" : "live",
  at: new Date().toISOString(),
  collector_id_before: collectorBefore,
  collector_id_after: collectorAfter,
  same_collector_id: sameId,
  broken_url: config.mock ? "mock" : brokenUrl,
  auto_approve: autoApprove || config.mock,
  before: {
    stored_as_success: healthy.stored_as_success,
    row_count: healthy.rows.length,
    error: healthy.error,
  },
  after: {
    stored_as_success: broken.stored_as_success,
    healed: broken.healed,
    row_count: broken.rows.length,
    error: broken.error,
    heal_events: broken.healEvents,
  },
  index_after_heal: restored
    ? {
        stored_as_success: restored.stored_as_success,
        row_count: restored.rows.length,
        error: restored.error,
      }
    : undefined,
};
const outFile = path.join(
  outDir,
  config.mock ? `heal-mock-${stamp}.json` : `heal-${stamp}.json`,
);
await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

console.log(`Wrote ${outFile}`);
console.log(`mode=${payload.mode} same_c_*=${sameId} retry_succeeded=${healed}`);
if (restored) {
  console.log(
    `index_after_heal success=${restored.stored_as_success} rows=${restored.rows.length}`,
  );
}

if (!sameId) {
  console.error("FAIL: collector id changed across heal");
  process.exit(1);
}
if (!healed && broken.healEvents.length === 0) {
  console.error("FAIL: no heal events");
  process.exit(1);
}
if (config.mock && !healed) {
  console.error("FAIL: mock heal did not recover");
  process.exit(1);
}
if (!broken.stored_as_success && (autoApprove || config.mock)) {
  console.error("FAIL: invalid rows after heal — not stored as success");
  process.exit(1);
}
if (restored && !restored.stored_as_success) {
  console.error("FAIL: original chaos URL no longer validates after heal");
  process.exit(1);
}
console.log("prove:tingle-heal PASS");
if (!config.mock && !autoApprove && !healed) {
  console.log(
    "Live heal stopped at preview. Re-run with --auto-approve after checking the proposed diff, or approve via bdata scraper approve.",
  );
}
