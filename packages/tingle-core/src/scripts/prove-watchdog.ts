import assert from "node:assert/strict";
import { BrightDataClient } from "../bd/client.js";
import { loadEnv, loadTingleConfig } from "../config.js";
import { firstLook } from "../jobs/firstLook.js";
import { tingleTick } from "../jobs/tingleTick.js";
import { isNewVersusBaseline, loadBaseline } from "../jobs/baseline.js";
import { DEFAULT_BUDGET } from "../schema/profile.js";
import type { PileableHit } from "../piles.js";

loadEnv();
const live = process.env.TINGLE_WATCHDOG_LIVE === "1";
const config = loadTingleConfig(
  live
    ? process.env
    : {
        TINGLE_MOCK: "1",
        BRIGHT_DATA_API_TOKEN: "",
        BRIGHT_DATA_API_TOKEN_2: "",
        BRIGHTDATA_API_KEY: "",
        BRIGHTDATA_API_KEY_2: "",
        AIMLAPI_KEY: "",
        TINGLE_SAMPLE_CLAIM:
          process.env.TINGLE_SAMPLE_CLAIM ||
          "a watch that tells indie builders when someone else ships their idea",
      },
);

const NEW_PATENT: PileableHit = {
  source: "serp",
  title: "Watch that tells indie builders when someone else ships their idea",
  url: `https://patents.google.com/patent/US20140142851A1?watchdog=${Date.now()}`,
  snippet: `${config.sampleClaim}. A haptic wearable watch vibrates when a nearby product claim ships.`,
  published_at: new Date().toISOString(),
  source_domain: "patents.google.com",
  office: "uspto",
  home: true,
  overlap_score: 0.81,
};

const look = await firstLook(
  {
    project_id: `watchdog-${Date.now()}`,
    pitch: config.sampleClaim,
    claim: config.sampleClaim,
    confirmed: true,
    stage: "starting",
  },
  { config, client: new BrightDataClient(config) },
);
assert.equal(look.status, "ok");
if (look.status !== "ok") process.exit(1);

const project = {
  id: look.profile.project_id,
  stage: look.profile.stage,
  claim: look.claim,
  ignore: [] as string[],
  tingle_on: true,
  alert_email: "builder@example.com",
  digest_floor: "daily" as const,
  budget: { ...DEFAULT_BUDGET, lane: "cheap" as const },
  paused: false,
  profile: look.profile,
  events: [],
};

const first = await tingleTick(
  project,
  { config, client: new BrightDataClient(config) },
  { extraHits: [] },
);
const baseline = await loadBaseline(project.id);
assert.ok(baseline, "first look / first tick must persist a baseline");

const piled = {
  ...NEW_PATENT,
  id: "watchdog-patent",
  why: "fixture patent for watchdog prove",
  collector: "serp",
  content_hash: "watchdog-hash",
  entity_key: "patents.google.com::haptic wearable",
  days_old: 0,
};
assert.equal(isNewVersusBaseline(piled, baseline), true);

const second = await tingleTick(
  { ...project, budget: first.budget, events: first.events },
  { config, client: new BrightDataClient(config) },
  { extraHits: [NEW_PATENT] },
);
assert.equal(second.status, "ok");
const urls = second.events.flatMap((e) => e.sources.map((s) => s.url));
assert.ok(
  urls.includes(NEW_PATENT.url) || (second.new_event_count ?? 0) >= 1,
  "second tick must surface the newly discovered patent URL",
);
const next = await loadBaseline(project.id);
assert.ok(next?.urls.includes(NEW_PATENT.url), "baseline must record the new patent URL");
console.log(
  JSON.stringify(
    {
      ok: true,
      mock: config.mock,
      project_id: project.id,
      new_event_count: second.new_event_count,
      new_url: NEW_PATENT.url,
    },
    null,
    2,
  ),
);
