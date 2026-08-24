import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { tingleDataDir } from "./paths.js";
import { masterKey, seal } from "./vault.js";
import type { TingleEvent, Urgency } from "./schema/events.js";

export type OutgoingMail = {
  id: string;
  at: string;
  to: string;
  subject: string;
  text: string;
  urgency: Urgency;
  event_ids: string[];
  project_id: string;
};

export type Mailer = {
  send(mail: Omit<OutgoingMail, "id" | "at">): Promise<OutgoingMail>;
};

function mailDir(): string {
  return path.join(tingleDataDir(), "mail");
}

/** Always-on outbox. Mailhog/Ethereal can sit in front later; JSON is the proof. */
export async function writeOutbox(mail: OutgoingMail): Promise<string> {
  const dir = mailDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${mail.at.replace(/[:.]/g, "-")}-${mail.id}.json`);
  await fs.writeFile(file, seal(masterKey(), mail), "utf8");
  return file;
}

export function fileMailer(): Mailer {
  return {
    async send(input) {
      const mail: OutgoingMail = {
        ...input,
        id: randomUUID(),
        at: new Date().toISOString(),
      };
      await writeOutbox(mail);
      return mail;
    },
  };
}

export function mailFromEvents(
  projectId: string,
  to: string,
  events: TingleEvent[],
  kind: "now" | "digest",
): Omit<OutgoingMail, "id" | "at"> {
  if (kind === "digest" && events.length === 0) {
    return {
      to,
      project_id: projectId,
      urgency: "quiet",
      event_ids: [],
      subject: "Tingle: nothing close",
      text: "Nothing close this period. That is a real Tingle.",
    };
  }
  const urgency = events.some((e) => e.urgency === "now")
    ? "now"
    : events.some((e) => e.urgency === "soon")
      ? "soon"
      : events[0]?.urgency ?? "note";
  const lines = events.map((e) => {
    const urls = e.sources.map((s) => `${s.collector} ${s.url}`).join("\n  ");
    return `[${e.urgency}] ${e.type} ${e.entity_key}\n  ${urls}`;
  });
  const subject =
    urgency === "now"
      ? `Tingle Now: ${events[0]?.entity_key ?? "movement in your lane"}`
      : `Tingle digest: ${events.length} event(s)`;
  return {
    to,
    project_id: projectId,
    urgency,
    event_ids: events.map((e) => e.id),
    subject,
    text: lines.join("\n\n") || "Nothing close.",
  };
}
