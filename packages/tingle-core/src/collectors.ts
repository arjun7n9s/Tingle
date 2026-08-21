import type { TriggerInput } from "./bd/client.js";
import type { CollectorKey, TingleConfig } from "./config.js";
import type { HitSource } from "./schema/hits.js";

export type CollectorPlan = {
  key: CollectorKey;
  source: HitSource;
  collectorId: string;
  inputs: TriggerInput[];
  /** Human-readable description of what this run targets. */
  target: string;
};

export type SkippedCollector = { key: CollectorKey; reason: string };

const SOURCE_BY_KEY: Record<CollectorKey, HitSource> = {
  search: "search",
  watch: "watch",
  chaos: "chaos",
};

/**
 * Work out which collectors can actually run, and with what inputs.
 *
 * A collector with no pinned id is *skipped and reported*, never created on
 * the fly — creating costs credits and a new id orphans downstream pointers.
 */
export function planCollectors(
  config: TingleConfig,
  opts: { claim?: string; only?: CollectorKey[] } = {},
): { plans: CollectorPlan[]; skipped: SkippedCollector[] } {
  const claim = opts.claim ?? config.sampleClaim;
  const wanted = opts.only ?? (["search", "watch", "chaos"] as CollectorKey[]);

  const plans: CollectorPlan[] = [];
  const skipped: SkippedCollector[] = [];

  for (const key of wanted) {
    const collectorId = resolveId(config, key);
    if (!collectorId) {
      skipped.push({
        key,
        reason: `no collector id pinned — set TINGLE_C_${key.toUpperCase()} in .env`,
      });
      continue;
    }

    const built = buildInputs(config, key, claim);
    if ("reason" in built) {
      skipped.push({ key, reason: built.reason });
      continue;
    }

    plans.push({
      key,
      source: SOURCE_BY_KEY[key],
      collectorId,
      inputs: built.inputs,
      target: built.target,
    });
  }

  return { plans, skipped };
}

/** Mock runs need no real id, but artifacts read better with a stable one. */
function resolveId(config: TingleConfig, key: CollectorKey): string | undefined {
  const pinned = config.collectors[key];
  if (pinned) return pinned;
  return config.mock ? `c_mock_${key}` : undefined;
}

function buildInputs(
  config: TingleConfig,
  key: CollectorKey,
  claim: string,
): { inputs: TriggerInput[]; target: string } | { reason: string } {
  if (key === "search") {
    if (config.searchUrlTemplate) {
      const url = config.searchUrlTemplate.replace(
        "{q}",
        encodeURIComponent(claim),
      );
      return { inputs: [{ url }], target: url };
    }
    const input: TriggerInput = { keyword: claim };
    if (config.searchCountry) input.country = config.searchCountry;
    return { inputs: [input], target: `keyword: ${claim}` };
  }

  const url = key === "watch" ? config.watchUrl : config.chaosUrl;
  if (!url) {
    const envName = key === "watch" ? "TINGLE_WATCH_URL" : "TINGLE_CHAOS_URL";
    return { reason: `no target url — set ${envName} in .env` };
  }
  return { inputs: [{ url }], target: url };
}
