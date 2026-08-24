"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { tingle } from "@/lib/tingle";
import { AppChrome } from "./AppChrome";
import { ChatLog, LookPanel, type FileProject, type Piles } from "./ui";
import { SpideyWait } from "./Spidey";

export type HomeProject = FileProject;

type Look = {
  claim: string;
  piles: Piles;
  sources_used: string[];
  collectors_failed: string[];
  quality?: {
    mock?: boolean;
    hits_scraped?: number;
    hits_matched?: number;
    dropped_sample?: string[];
  };
};

export function Home({ me }: { me: { email: string } }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [asked, setAsked] = useState("");
  const [claim, setClaim] = useState("");
  const [reply, setReply] = useState("");
  const [look, setLook] = useState<Look | null>(null);

  async function check(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setCheckError("");
    try {
      const res = await tingle<{ claim: string; reply: string; look: Look }>(
        "/quick-chat",
        { method: "POST", body: JSON.stringify({ message }) },
      );
      setAsked(message);
      setClaim(res.claim);
      setReply(res.reply);
      setLook(res.look);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AppChrome>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <span className="tingle-band">Desk</span>
          <h1 className="tingle-app-title mt-4">Already out there?</h1>
          <p className="mt-3 max-w-lg text-[1.02rem] leading-relaxed text-[var(--muted)]">
            Paste one sentence. We pull public pages and sort what already
            exists. Nothing is saved until you keep it.
          </p>
        </div>
        <form onSubmit={(e) => void check(e)} className="space-y-5">
          <textarea
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Haptic gloves that help you walk without looking at a map."
            className="tingle-pad"
          />
          <div className="flex flex-wrap items-center gap-5">
            <button type="submit" disabled={pending} className="tingle-app-btn">
              {pending ? "Looking…" : "Check this →"}
            </button>
            <Link href="/tingle/new" className="tingle-ghost">
              File it instead
            </Link>
          </div>
        </form>
        {pending ? (
          <>
            <SpideyWait move="run" copy="Looking" />
            <ChatLog
              messages={[{ id: "u", role: "user", text: message }]}
              thinking
            />
          </>
        ) : null}
        {checkError ? (
          <p className="text-sm text-[var(--danger)]">{checkError}</p>
        ) : null}
        {reply ? (
          <div className="space-y-6">
            <ChatLog
              messages={[
                { id: "u", role: "user", text: asked },
                { id: "a", role: "analyst", text: reply },
              ]}
            />
            {look ? <LookPanel look={look} /> : null}
            <Link
              href={`/tingle/new?claim=${encodeURIComponent(claim)}`}
              className="tingle-app-btn w-fit"
            >
              Keep as a file →
            </Link>
          </div>
        ) : null}
        <p className="sr-only">{me.email}</p>
      </div>
    </AppChrome>
  );
}
