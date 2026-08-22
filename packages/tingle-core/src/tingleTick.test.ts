import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrightDataClient } from "./bd/client.js";
import { mockNewWatchLaunch } from "./bd/mock.js";
import { PAUSE_COPY } from "./budget.js";
import { loadTingleConfig } from "./config.js";
import { firstLook } from "./jobs/firstLook.js";
import { tingleTick, TINGLE_TRANSPORT } from "./jobs/tingleTick.js";
import type { OutgoingMail } from "./mail.js";
import { DEFAULT_BUDGET } from "./schema/profile.js";

const config = loadTingleConfig({
  TINGLE_MOCK: "1",
  BRIGHT_DATA_API_TOKEN: "",
  BRIGHT_DATA_API_TOKEN_2: "",
  BRIGHTDATA_API_KEY: "",
  TINGLE_SAMPLE_CLAIM:
    "a watch that tells indie builders when someone else ships their idea",
});

function capturingMailer() {
  const sent: OutgoingMail[] = [];
  return {
    sent,
    mailer: {
      async send(input: Omit<OutgoingMail, "id" | "at">): Promise<OutgoingMail> {
        const mail = {
          ...input,
          id: `mail-${sent.length}`,
          at: new Date().toISOString(),
        };
        sent.push(mail);
        return mail;
      },
    },
  };
}

describe("tingleTick", () => {
  it("second run with a new watch row produces one event, not a reprint, and Now-mails", async () => {
    const client = new BrightDataClient(config);
    const look = await firstLook(
      {
        project_id: `tick-${Date.now()}`,
        pitch: config.sampleClaim,
        claim: config.sampleClaim,
        confirmed: true,
        stage: "starting",
      },
      { config, client },
    );
    assert.equal(look.status, "ok");
    if (look.status !== "ok") return;

    const box = capturingMailer();
    const project = {
      id: look.profile.project_id,
      stage: look.profile.stage,
      claim: look.claim,
      ignore: [] as string[],
      tingle_on: true,
      alert_email: "builder@example.com",
      digest_floor: "daily" as const,
      budget: { ...DEFAULT_BUDGET },
      paused: false,
      profile: look.profile,
      events: [],
    };

    const first = await tingleTick(project, { config, client }, {
      extraRows: { watch: [mockNewWatchLaunch()] },
      mailer: box.mailer,
    });
    assert.equal(first.transport, TINGLE_TRANSPORT);
    assert.ok(client.triggerLog.some((t) => t.path === "/dca/trigger"));
    assert.equal(first.status, "ok");
    assert.equal(first.new_event_count, 1);
    assert.equal(first.reprint, false);
    assert.equal(first.events[0]?.type, "just_shipped");
    assert.equal(first.events[0]?.urgency, "now");
    assert.equal(first.events[0]?.sources.length, 1);
    assert.ok(first.mail.some((m) => m.urgency === "now"));
    assert.match(first.mail[0]?.subject ?? "", /Tingle Now/i);

    const again = await tingleTick(
      { ...project, budget: first.budget, events: first.events },
      { config, client },
      {
        extraRows: { watch: [mockNewWatchLaunch()] },
        mailer: box.mailer,
      },
    );
    assert.equal(again.new_event_count, 0);
    assert.equal(again.reprint, false);
  });

  it("cap hit pauses the worker before another scrape", async () => {
    const client = new BrightDataClient(config);
    const look = await firstLook(
      {
        project_id: `tick-cap-${Date.now()}`,
        pitch: config.sampleClaim,
        claim: config.sampleClaim,
        confirmed: true,
        stage: "starting",
      },
      { config, client },
    );
    assert.equal(look.status, "ok");
    if (look.status !== "ok") return;

    const triggersBefore = client.triggerLog.length;
    const paused = await tingleTick(
      {
        id: look.profile.project_id,
        stage: look.profile.stage,
        claim: look.claim,
        ignore: [],
        tingle_on: true,
        alert_email: "builder@example.com",
        digest_floor: "daily",
        budget: { cap: 2, spent: 2, lane: "cheap" },
        paused: false,
        profile: look.profile,
        events: [],
      },
      { config, client },
    );
    assert.equal(paused.status, "paused");
    assert.equal(paused.page_loads, 0);
    assert.equal(paused.new_event_count, 0);
    assert.equal(paused.paused_reason, PAUSE_COPY);
    assert.equal(client.triggerLog.length, triggersBefore);
  });
});
