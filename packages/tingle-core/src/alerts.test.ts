import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fireWatchAlerts } from "./alerts.js";

describe("fireWatchAlerts", () => {
  it("posts Slack and generic payloads and does not throw on failure", async () => {
    const original = globalThis.fetch;
    const urls: string[] = [];
    const bodies: string[] = [];
    globalThis.fetch = (async (input, init) => {
      urls.push(String(input));
      bodies.push(String(init?.body ?? ""));
      if (String(input).includes("fail")) throw new Error("down");
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      await fireWatchAlerts(
        [
          "https://hooks.slack.com/services/x",
          "https://example.com/hook",
          "https://example.com/fail",
          "",
          "https://hooks.slack.com/services/x",
        ],
        {
          project_id: "p1",
          event_count: 1,
          urgency: "now",
          entity_keys: ["Acme"],
          urls: ["https://example.com/launch"],
          claim: "a watch for builders",
        },
      );
      assert.equal(urls.length, 3);
      assert.equal(bodies.some((b) => b.includes('"text"')), true);
      assert.equal(bodies.some((b) => b.includes("project_id")), true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does nothing when there are no events", async () => {
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("ok");
    }) as typeof fetch;
    try {
      await fireWatchAlerts(["https://example.com/hook"], {
        project_id: "p1",
        event_count: 0,
        urgency: "quiet",
        entity_keys: [],
        urls: [],
      });
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
