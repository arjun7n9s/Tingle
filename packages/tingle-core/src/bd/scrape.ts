import type { CollectorKey, TingleConfig } from "../config.js";
import type { HealEvent, HealStage } from "../schema/events.js";
import type { HitRow } from "../schema/hits.js";
import { BrightDataClient, classifyHealStatus } from "./client.js";
import { mockBrokenChaos, mockRowsFor } from "./mock.js";
import {
  buildHealPrompt,
  isValidationSuccess,
  validateRows,
} from "./validate.js";
import { requirePinned, triggerInputs } from "../config.js";

export type ScrapeOutcome = {
  rows: HitRow[];
  healEvents: HealEvent[];
  healed: boolean;
  /** True only when every returned row parsed and none failed. */
  stored_as_success: boolean;
  error?: string;
};

export type ScrapeOpts = {
  forceChaosBreak?: boolean;
  /** Default false: stop at the preview gate. */
  autoApprove?: boolean;
  onHealEvent?: (e: HealEvent) => void;
  /** Override the collector trigger URL (live chaos break uses broken.html). */
  url?: string;
  /** Replace the default Zod-derived heal prompt (still clipped to 1000). */
  healPrompt?: string;
  /** Extra mock rows appended after the fixture (Tingle tick proofs). */
  extraRows?: unknown[];
};

export async function scrapeAndValidate(
  client: BrightDataClient,
  config: TingleConfig,
  source: CollectorKey,
  opts: ScrapeOpts = {},
): Promise<ScrapeOutcome> {
  let collectorId: string;
  try {
    collectorId = client.mock
      ? config.collectors[source] ?? `mock_${source}`
      : requirePinned(config, source);
  } catch (err) {
    return {
      rows: [],
      healEvents: [],
      healed: false,
      stored_as_success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const inputs = triggerInputs(source, config, opts.url);
  const healEvents: HealEvent[] = [];

  const push = (e: {
    stage: HealStage;
    detail: string;
    zod_issues?: string[];
    preview?: unknown;
  }) => {
    const event: HealEvent = {
      id: `${source}-${Date.now()}-${healEvents.length}`,
      at: new Date().toISOString(),
      collector_id: collectorId,
      collector: source,
      stage: e.stage,
      detail: e.detail,
      zod_issues: e.zod_issues,
      preview: e.preview,
    };
    healEvents.push(event);
    opts.onHealEvent?.(event);
  };

  let raw: unknown[];
  try {
    raw = await collect(client, collectorId, inputs, source, opts);
  } catch (err) {
    return {
      rows: [],
      healEvents,
      healed: false,
      stored_as_success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let result = validateRows(source, raw);
  if (isValidationSuccess(result)) {
    return {
      rows: result.ok,
      healEvents,
      healed: false,
      stored_as_success: true,
    };
  }

  const prompt = (opts.healPrompt ?? buildHealPrompt(source, result.issues)).slice(
    0,
    1000,
  );
  push({
    stage: "validation_failed",
    detail: `Zod validation failed for ${source}`,
    zod_issues: result.issues,
  });
  push({
    stage: "heal_started",
    detail: prompt,
  });

  try {
    if (client.mock) {
      push({
        stage: "heal_pending_approval",
        detail: "Mock heal proposed selector rewrite",
        preview: mockRowsFor(source),
      });
      if (!opts.autoApprove) {
        return {
          rows: [],
          healEvents,
          healed: false,
          stored_as_success: false,
          error: "heal awaiting approval",
        };
      }
      push({
        stage: "heal_approved",
        detail: "Auto-approved mock heal",
      });
      push({
        stage: "retry_started",
        detail: "Re-scraping after mock heal",
      });
      raw = mockRowsFor(source);
    } else {
      await client.triggerHeal(collectorId, prompt);
      let progress = await client.pollHealProgress(collectorId);
      const gate = classifyHealStatus(progress.status) === "gate";
      push({
        stage: "heal_pending_approval",
        detail: `Heal status: ${progress.status}`,
        preview: progress.preview,
      });
      if (gate && !opts.autoApprove) {
        return {
          rows: [],
          healEvents,
          healed: false,
          stored_as_success: false,
          error: "heal awaiting approval",
        };
      }
      if (gate) {
        await client.resumeHeal(collectorId, { approve: true, autoSave: true });
        progress = await client.pollHealProgress(collectorId);
      }
      if (classifyHealStatus(progress.status) === "failed") {
        push({
          stage: "retry_failed",
          detail: `Heal finished with status ${progress.status}`,
        });
        return {
          rows: [],
          healEvents,
          healed: false,
          stored_as_success: false,
          error: `heal failed: ${progress.status}`,
        };
      }
      push({
        stage: "heal_approved",
        detail: `Heal finished with status ${progress.status}`,
      });
      push({
        stage: "retry_started",
        detail: "Re-triggering collector after heal",
      });
      raw = await client.scrape(collectorId, inputs);
    }

    result = validateRows(source, raw);
    if (isValidationSuccess(result)) {
      push({
        stage: "retry_succeeded",
        detail: `Recovered ${result.ok.length} row(s) for ${source}`,
      });
      return {
        rows: result.ok,
        healEvents,
        healed: true,
        stored_as_success: true,
      };
    }

    push({
      stage: "retry_failed",
      detail: `Still invalid after heal: ${result.issues.join("; ")}`,
      zod_issues: result.issues,
    });
    return {
      rows: result.ok,
      healEvents,
      healed: true,
      stored_as_success: false,
      error: result.issues.join("; "),
    };
  } catch (err) {
    push({
      stage: "retry_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
    return {
      rows: [],
      healEvents,
      healed: false,
      stored_as_success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function collect(
  client: BrightDataClient,
  collectorId: string,
  inputs: { url: string }[],
  source: CollectorKey,
  opts: ScrapeOpts,
): Promise<unknown[]> {
  if (client.mock) {
    client.noteTransport("/dca/trigger", collectorId);
    const base =
      opts.forceChaosBreak && source === "chaos"
        ? mockBrokenChaos()
        : mockRowsFor(source);
    return [...base, ...(opts.extraRows ?? [])];
  }
  return client.scrape(collectorId, inputs);
}
