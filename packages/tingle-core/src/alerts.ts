import { fetchT } from "./edge/fetchT.js";

export type WatchAlertPayload = {
  project_id: string;
  event_count: number;
  urgency: string;
  entity_keys: string[];
  urls: string[];
  /** Omitted when the project is stealth — never put the claim on a webhook. */
  claim?: string;
};

/**
 * Fire-and-forget Now/digest hooks. Empty URLs skip. Failures never throw:
 * a dead Slack hook must not roll back a stored tick.
 */
export async function fireWatchAlerts(
  hooks: Array<string | undefined>,
  payload: WatchAlertPayload,
): Promise<void> {
  const urls = [...new Set(hooks.map((u) => u?.trim()).filter(Boolean))] as string[];
  if (!urls.length || payload.event_count === 0) return;
  const body = JSON.stringify(payload);
  const text = [
    `Tingle ${payload.urgency}: ${payload.event_count} event(s)`,
    payload.claim ? payload.claim : `project ${payload.project_id}`,
    ...payload.entity_keys.slice(0, 5),
    ...payload.urls.slice(0, 5),
  ].join("\n");

  await Promise.all(
    urls.map(async (url) => {
      try {
        const slack = /hooks\.slack\.com/i.test(url);
        const discord = /discord(?:app)?\.com\/api\/webhooks/i.test(url);
        await fetchT(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: slack
              ? JSON.stringify({ text })
              : discord
                ? JSON.stringify({ content: text.slice(0, 1900) })
                : body,
          },
          8_000,
        );
      } catch {
        // Hook is best-effort. The tick already persisted.
      }
    }),
  );
}
