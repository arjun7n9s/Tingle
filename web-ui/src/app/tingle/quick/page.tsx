"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { tingle } from "@/lib/tingle";
import { AppChrome } from "../AppChrome";
import { ChatLog, LookPanel, type Piles } from "../ui";
import { SpideyWait } from "../Spidey";

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

export default function QuickChatPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [claim, setClaim] = useState("");
  const [reply, setReply] = useState("");
  const [look, setLook] = useState<Look | null>(null);
  const [asked, setAsked] = useState("");

  async function send(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AppChrome>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <span className="tingle-band">Nothing saved</span>
          <h1 className="tingle-app-title mt-4">Quick check</h1>
          <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-[var(--muted)]">
            Paste an idea. We look at public pages and show what already exists.
            This is not saved, and we do not keep watching.
          </p>
        </div>
        <form onSubmit={send} className="space-y-4">
          <textarea
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="One sentence is enough."
            className="tingle-pad"
          />
          <button type="submit" disabled={pending} className="tingle-app-btn">
            {pending ? "Looking…" : "Check this →"}
          </button>
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
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {reply ? (
          <ChatLog
            messages={[
              { id: "u", role: "user", text: asked },
              { id: "a", role: "analyst", text: reply },
            ]}
          />
        ) : null}
        {look ? (
          <>
            <LookPanel look={look} />
            <Link
              href={`/tingle/new?claim=${encodeURIComponent(claim)}`}
              className="tingle-app-btn w-fit"
            >
              Keep as a file →
            </Link>
          </>
        ) : null}
      </div>
    </AppChrome>
  );
}
