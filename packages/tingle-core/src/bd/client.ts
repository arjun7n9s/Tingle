import type { TingleConfig } from "../config.js";

/** Whatever the collector's trigger schema expects: `{url}`, `{keyword, country}`, … */
export type TriggerInput = Record<string, string | number | boolean>;

export class BrightDataError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "BrightDataError";
  }
}

export type HealProgress = {
  status: string;
  /** Proposed extractor output, when Bright Data reaches the approval gate. */
  preview?: unknown;
  raw: unknown;
};

const GATE_STATUSES = new Set(["pending_answer", "awaiting_approval"]);
const DONE_STATUSES = new Set(["done", "completed", "ready", "saved"]);
const FAIL_STATUSES = new Set(["failed", "error", "rejected"]);

export function classifyHealStatus(
  status: string,
): "gate" | "done" | "failed" | "running" {
  if (GATE_STATUSES.has(status)) return "gate";
  if (DONE_STATUSES.has(status)) return "done";
  if (FAIL_STATUSES.has(status)) return "failed";
  return "running";
}

/**
 * Generic Scraper Studio client. Takes a `collectorId` per call rather than
 * mapping a fixed source enum onto three collectors, so a new watch target is
 * a new pinned id in env — not a code change.
 */
export class BrightDataClient {
  /** Every Tingle job records `POST /dca/trigger` here — never a dashboard run. */
  readonly triggerLog: { at: string; collectorId: string; path: "/dca/trigger" }[] =
    [];

  constructor(private readonly config: TingleConfig) {}

  get mock() {
    return this.config.mock;
  }

  noteTransport(path: "/dca/trigger", collectorId: string): void {
    this.triggerLog.push({
      at: new Date().toISOString(),
      collectorId,
      path,
    });
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.config.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  private url(path: string, query: Record<string, string> = {}) {
    const u = new URL(path, this.config.baseUrl);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u.toString();
  }

  private async json(res: Response): Promise<unknown> {
    return res.json().catch(() => ({}));
  }

  /**
   * `GET /dca/collectors_list` — reuse an existing c_* rather than creating.
   * https://docs.brightdata.com/api-reference/scraper-studio-api/list-scrapers
   */
  async listCollectors(): Promise<
    { id: string; name: string; status?: string }[]
  > {
    const res = await this.fetchRetry(
      this.url("/dca/collectors_list"),
      { headers: this.headers() },
    );
    const body = await this.json(res);
    if (!res.ok) {
      throw new BrightDataError("list collectors failed", res.status, body);
    }
    const rows = Array.isArray(body)
      ? body
      : ((body as { data?: unknown[] }).data ?? []);
    return rows
      .map((c) => {
        const row = c as {
          id?: string;
          collector_id?: string;
          name?: string;
          status?: string;
          active?: boolean;
        };
        return {
          id: row.id ?? row.collector_id ?? "",
          name: row.name ?? "",
          status:
            row.status ??
            (row.active === false ? "inactive" : row.active ? "active" : undefined),
        };
      })
      .filter((c) => c.id);
  }

  /** `POST /dca/trigger` — the production path for every Tingle job. */
  async triggerCollection(
    collectorId: string,
    inputs: TriggerInput[],
  ): Promise<string> {
    requireCollector(collectorId);
    this.noteTransport("/dca/trigger", collectorId);
    const res = await this.fetchRetry(
      this.url("/dca/trigger", { collector: collectorId, queue_next: "1" }),
      { method: "POST", headers: this.headers(), body: JSON.stringify(inputs) },
    );
    const body = await this.json(res);
    if (!res.ok) {
      throw new BrightDataError(
        `trigger failed for ${collectorId}`,
        res.status,
        body,
      );
    }
    const b = body as { collection_id?: string; snapshot_id?: string };
    const id = b.collection_id ?? b.snapshot_id;
    if (!id) {
      throw new BrightDataError(
        "trigger response missing collection_id",
        res.status,
        body,
      );
    }
    return id;
  }

  /**
   * Poll until the dataset has rows.
   *
   * A collection that stays empty is returned as `[]` after `emptyAfterMs`
   * rather than thrown as a timeout: zero rows is a validation failure the
   * heal path should handle, not a transport error.
   */
  async pollDataset(
    collectionId: string,
    opts: {
      timeoutMs?: number;
      intervalMs?: number;
      emptyAfterMs?: number;
    } = {},
  ): Promise<unknown[]> {
    const timeoutMs = opts.timeoutMs ?? 180_000;
    const intervalMs = opts.intervalMs ?? 5_000;
    const emptyAfterMs = opts.emptyAfterMs ?? 60_000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const res = await this.fetchRetry(
        this.url("/dca/dataset", { id: collectionId }),
        { headers: this.headers() },
      );
      const body = await this.json(res);
      if (res.status === 202) {
        await sleep(intervalMs);
        continue;
      }

      if (Array.isArray(body)) {
        if (body.length > 0) return body;
        if (Date.now() - started >= emptyAfterMs) return [];
      } else if (body && typeof body === "object") {
        const status = String(
          (body as { status?: string }).status ?? "",
        ).toLowerCase();
        if (FAIL_STATUSES.has(status)) {
          throw new BrightDataError(
            `collection ${collectionId} reported status ${status}`,
            res.status,
            body,
          );
        }
      }
      await sleep(intervalMs);
    }
    throw new BrightDataError(`dataset poll timed out for ${collectionId}`, undefined, {
      collectionId,
    });
  }

  async scrape(
    collectorId: string,
    inputs: TriggerInput[],
    opts: { timeoutMs?: number } = {},
  ): Promise<unknown[]> {
    const collectionId = await this.triggerCollection(collectorId, inputs);
    return this.pollDataset(collectionId, opts);
  }

  /** `POST /dca/collectors/{c_*}/refactor_template` — heal in place. */
  async triggerHeal(collectorId: string, prompt: string): Promise<unknown> {
    requireCollector(collectorId);
    const res = await fetch(
      this.url(`/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template`),
      {
        method: "POST",
        headers: this.headers(),
        // The API caps the heal prompt at 1000 chars.
        body: JSON.stringify({ prompt: prompt.slice(0, 1000) }),
      },
    );
    const body = await this.json(res);
    if (!res.ok) {
      throw new BrightDataError(
        `heal trigger failed for ${collectorId}`,
        res.status,
        body,
      );
    }
    return body;
  }

  async pollHealProgress(
    collectorId: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<HealProgress> {
    requireCollector(collectorId);
    const timeoutMs = opts.timeoutMs ?? 600_000;
    const intervalMs = opts.intervalMs ?? 5_000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const res = await fetch(
        this.url(
          `/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template/progress`,
        ),
        { headers: this.headers() },
      );
      const body = (await this.json(res)) as {
        status?: string;
        preview_result?: unknown;
        preview?: unknown;
      };
      const status = String(body.status ?? "unknown").toLowerCase();
      if (classifyHealStatus(status) !== "running") {
        return {
          status,
          preview: body.preview_result ?? body.preview,
          raw: body,
        };
      }
      await sleep(intervalMs);
    }
    throw new BrightDataError(`heal progress timed out for ${collectorId}`);
  }

  /**
   * `POST /dca/collectors/{c_*}/resume_automation_job` — commit or reject the
   * proposed fix. `auto_save` persists the healed template; without it the
   * approval can land without the rewrite being saved.
   */
  async resumeHeal(
    collectorId: string,
    opts: { approve?: boolean; autoSave?: boolean } = {},
  ): Promise<unknown> {
    requireCollector(collectorId);
    const approve = opts.approve ?? true;
    const res = await fetch(
      this.url(
        `/dca/collectors/${encodeURIComponent(collectorId)}/resume_automation_job`,
      ),
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          message: approve,
          auto_save: opts.autoSave ?? approve,
        }),
      },
    );
    const body = await this.json(res);
    if (!res.ok) {
      throw new BrightDataError(
        `heal ${approve ? "approve" : "reject"} failed for ${collectorId}`,
        res.status,
        body,
      );
    }
    return body;
  }

  /**
   * Retry 5xx / network the way Bright Data's Node sample does. 4xx fails
   * fast except 429, which backs off.
   */
  private async fetchRetry(
    url: string,
    init: RequestInit,
    attempts = 3,
  ): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, init);
        if (res.status >= 500 || res.status === 429) {
          lastErr = new BrightDataError(`transient ${res.status}`, res.status);
          await sleep(1_000 * (i + 1));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        await sleep(1_000 * (i + 1));
      }
    }
    if (lastErr instanceof BrightDataError) throw lastErr;
    throw lastErr instanceof Error
      ? lastErr
      : new BrightDataError(String(lastErr));
  }
}

function requireCollector(collectorId: string): void {
  if (!collectorId?.trim()) {
    throw new BrightDataError(
      "no collector id supplied — pin TINGLE_C_* in .env rather than creating a new collector",
    );
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
