import { randomUUID } from "node:crypto";
import type { HealEvent, HealStage } from "../schema/events.js";
import type { HitRow, HitSource } from "../schema/hits.js";
import { classifyHealStatus, type BrightDataClient, type TriggerInput } from "./client.js";
import { mockBrokenRows, mockRows } from "./mock.js";
import { buildHealPrompt, validateRows } from "./validate.js";

export type ScrapeRequest = {
  /** Pinned collector id. Same id before and after any heal. */
  collectorId: string;
  source: HitSource;
  inputs: TriggerInput[];
  /**
   * Commit a proposed heal without human review. Unattended jobs only — a
   * blind approve can write a wrong schema to a live collector.
   */
  autoApprove?: boolean;
  /** Mock only: return broken rows so the heal path can be exercised. */
  forceBreak?: boolean;
  onHealEvent?: (e: HealEvent) => void;
};

export type ScrapeOutcome = {
  collectorId: string;
  source: HitSource;
  hits: HitRow[];
  healEvents: HealEvent[];
  /** A heal ran to completion and the collector was retried. */
  healed: boolean;
  /** A heal is parked at the approval gate. Nothing was committed. */
  awaitingApproval: boolean;
  error?: string;
};

/**
 * Scrape a pinned collector, gate the rows through the schema, and repair the
 * extractor in place if the gate fails.
 *
 * Invariants:
 *   - Rows that fail validation are never returned as a success.
 *   - The collector id never changes, so callers holding it keep working.
 *   - Without `autoApprove`, a proposed heal stops at the gate with its
 *     preview attached rather than being committed.
 */
export async function scrapeAndValidate(
  client: BrightDataClient,
  req: ScrapeRequest,
): Promise<ScrapeOutcome> {
  const { collectorId, source, inputs } = req;
  const healEvents: HealEvent[] = [];

  const emit = (
    stage: HealStage,
    detail: string,
    extra: { zod_issues?: string[]; preview?: unknown } = {},
  ) => {
    const event: HealEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      collector_id: collectorId,
      collector: source,
      stage,
      detail,
      ...extra,
    };
    healEvents.push(event);
    req.onHealEvent?.(event);
  };

  const base = { collectorId, source, healEvents };

  const fetchRows = (broken = false): Promise<unknown[]> => {
    if (client.mock) {
      return Promise.resolve(broken ? mockBrokenRows(source) : mockRows(source));
    }
    return client.scrape(collectorId, inputs);
  };

  // ── first attempt ────────────────────────────────────────────────────────
  let raw: unknown[];
  try {
    raw = await fetchRows(Boolean(req.forceBreak) && client.mock);
  } catch (err) {
    return {
      ...base,
      hits: [],
      healed: false,
      awaitingApproval: false,
      error: message(err),
    };
  }

  let result = validateRows(source, raw);
  if (isClean(result)) {
    return { ...base, hits: result.ok, healed: false, awaitingApproval: false };
  }

  emit(
    "validation_failed",
    `${result.rejected || "all"} row(s) failed the schema for ${source} — ` +
      `treating as an extractor incident, not an empty result`,
    { zod_issues: result.issues },
  );

  const prompt = buildHealPrompt(source, result.issueDetails, {
    totalRows: raw.length,
  });
  emit("heal_started", prompt, { zod_issues: result.issues });

  // ── heal ─────────────────────────────────────────────────────────────────
  try {
    if (client.mock) {
      if (!req.autoApprove) {
        emit(
          "heal_pending_approval",
          "Mock heal reached the approval gate. Nothing committed — pass " +
            "autoApprove to continue, mirroring the CLI's default.",
          { preview: mockRows(source).slice(0, 1) },
        );
        return {
          ...base,
          hits: [],
          healed: false,
          awaitingApproval: true,
          error: "heal awaiting approval",
        };
      }
      emit("heal_approved", "Mock heal auto-approved (flagged run)");
    } else {
      await client.triggerHeal(collectorId, prompt);
      const progress = await client.pollHealProgress(collectorId);
      const kind = classifyHealStatus(progress.status);

      if (kind === "failed") {
        emit("retry_failed", `heal reported status ${progress.status}`);
        return {
          ...base,
          hits: [],
          healed: false,
          awaitingApproval: false,
          error: `heal failed with status ${progress.status}`,
        };
      }

      if (kind === "gate") {
        if (!req.autoApprove) {
          emit(
            "heal_pending_approval",
            `Heal is awaiting approval (status ${progress.status}). Nothing ` +
              `committed. Review the preview, then approve to retry.`,
            { preview: progress.preview },
          );
          return {
            ...base,
            hits: [],
            healed: false,
            awaitingApproval: true,
            error: "heal awaiting approval",
          };
        }
        await client.resumeHeal(collectorId, { approve: true, autoSave: true });
        emit("heal_approved", "Heal approved and saved (flagged run)", {
          preview: progress.preview,
        });
      } else {
        emit("heal_approved", `Heal finished with status ${progress.status}`, {
          preview: progress.preview,
        });
      }
    }

    // ── retry, same collector id ──────────────────────────────────────────
    emit("retry_started", `Re-triggering ${collectorId} after heal`);
    raw = await fetchRows(false);
    result = validateRows(source, raw);

    if (isClean(result)) {
      emit(
        "retry_succeeded",
        `Recovered ${result.ok.length} row(s) from ${collectorId} — same collector id`,
      );
      return { ...base, hits: result.ok, healed: true, awaitingApproval: false };
    }

    emit("retry_failed", "Still failing the schema after heal", {
      zod_issues: result.issues,
    });
    return {
      ...base,
      // Deliberately empty: a partial pass is not a successful scrape.
      hits: [],
      healed: true,
      awaitingApproval: false,
      error: result.issues.join("; "),
    };
  } catch (err) {
    emit("retry_failed", message(err));
    return {
      ...base,
      hits: [],
      healed: false,
      awaitingApproval: false,
      error: message(err),
    };
  }
}

/**
 * Approve a heal that was parked at the gate, then retry the same collector.
 * The human half of the default preview-then-approve flow.
 */
export async function approveAndRetry(
  client: BrightDataClient,
  req: Omit<ScrapeRequest, "autoApprove" | "forceBreak">,
): Promise<ScrapeOutcome> {
  const { collectorId, source } = req;
  const healEvents: HealEvent[] = [];
  const emit = (stage: HealStage, detail: string, extra: { zod_issues?: string[] } = {}) => {
    const event: HealEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      collector_id: collectorId,
      collector: source,
      stage,
      detail,
      ...extra,
    };
    healEvents.push(event);
    req.onHealEvent?.(event);
  };
  const base = { collectorId, source, healEvents };

  try {
    if (!client.mock) {
      await client.resumeHeal(collectorId, { approve: true, autoSave: true });
    }
    emit("heal_approved", "Heal approved by a human, template saved");

    emit("retry_started", `Re-triggering ${collectorId} after approval`);
    const raw = client.mock
      ? mockRows(source)
      : await client.scrape(collectorId, req.inputs);
    const result = validateRows(source, raw);

    if (isClean(result)) {
      emit(
        "retry_succeeded",
        `Recovered ${result.ok.length} row(s) from ${collectorId} — same collector id`,
      );
      return { ...base, hits: result.ok, healed: true, awaitingApproval: false };
    }

    emit("retry_failed", "Still failing the schema after approval", {
      zod_issues: result.issues,
    });
    return {
      ...base,
      hits: [],
      healed: true,
      awaitingApproval: false,
      error: result.issues.join("; "),
    };
  } catch (err) {
    emit("retry_failed", message(err));
    return {
      ...base,
      hits: [],
      healed: false,
      awaitingApproval: false,
      error: message(err),
    };
  }
}

/** Reject a proposed heal so it can be retried with a sharper prompt. */
export async function rejectHeal(
  client: BrightDataClient,
  collectorId: string,
): Promise<void> {
  if (client.mock) return;
  await client.resumeHeal(collectorId, { approve: false, autoSave: false });
}

function isClean(result: { ok: HitRow[]; issues: string[] }): boolean {
  return result.issues.length === 0 && result.ok.length > 0;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
