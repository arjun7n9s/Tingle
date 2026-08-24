"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { tingle } from "@/lib/tingle";
import { AppChrome } from "../../AppChrome";
import {
  BudgetBar,
  ChatLog,
  ClaimText,
  EventFeed,
  fileStatus,
  LookPanel,
  PatentDesk,
  PileTally,
  type Patentability,
  type Piles,
} from "../../ui";
import { SpideyWait } from "../../Spidey";

type Project = {
  id: string;
  title?: string;
  claim: string;
  messages: {
    id: string;
    role: "user" | "analyst";
    text: string;
    narrated?: boolean;
    kind?: "house" | "look";
  }[];
  tingle_on?: boolean;
  alert_email?: string;
  webhook_url?: string;
  paused?: boolean;
  paused_reason?: string;
  pause_copy?: string;
  budget?: { cap: number; spent: number; lane?: "cheap" | "deep" };
  storage?: "vault" | "github";
  github_repo?: string;
  github_connected?: boolean;
  events?: {
    id: string;
    at: string;
    type: string;
    urgency: string;
    entity_key: string;
    sources: { collector: string; url: string }[];
  }[];
  last_look?: {
    piles: Piles;
    sources_used: string[];
    collectors_failed: string[];
    heal_events?: { stage: string; collector?: string; detail?: string }[];
    quality?: {
      hits_scraped: number;
      hits_matched: number;
      mock?: boolean;
      dropped_sample?: string[];
      dropped_count?: number;
    };
  };
  last_patentability?: Patentability;
};

export function ProjectDesk() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const [project, setProject] = useState<Project | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [hook, setHook] = useState("");
  const [repo, setRepo] = useState("");
  const [pat, setPat] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [looking, setLooking] = useState(false);
  const [patenting, setPatenting] = useState(false);
  const [llmOn, setLlmOn] = useState<boolean | null>(null);
  const [llmModel, setLlmModel] = useState<string | null>(null);

  async function refresh() {
    const res = await tingle<{ project: Project }>(`/projects/${id}`);
    setProject(res.project);
    if (res.project.github_repo) setRepo(res.project.github_repo);
    if (res.project.alert_email) setEmail(res.project.alert_email);
    else {
      const me = await tingle<{ email: string }>("/me");
      setEmail(me.email);
    }
    if (res.project.webhook_url) setHook(res.project.webhook_url);
  }

  useEffect(() => {
    refresh().catch((err: Error) => {
      if (/not signed in/i.test(err.message)) {
        window.location.href = "/tingle?auth=signin";
      } else setError(err.message);
    });
    tingle<{ llm?: boolean; llm_model?: string | null }>("/health")
      .then((h) => {
        setLlmOn(Boolean(h.llm));
        setLlmModel(h.llm_model ?? null);
      })
      .catch(() => setLlmOn(false));
  }, [id]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await tingle<{ project: Project }>(`/projects/${id}/analyst`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setProject(res.project);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function runFirstLook() {
    setPending(true);
    setLooking(true);
    setError("");
    try {
      const res = await tingle<{ project: Project }>(
        `/projects/${id}/first-look`,
        {
          method: "POST",
          body: JSON.stringify({ confirmed: true, rebuild: true }),
        },
      );
      setProject(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
      setLooking(false);
    }
  }

  async function runPatentability() {
    setPending(true);
    setPatenting(true);
    setError("");
    try {
      const res = await tingle<{ project: Project }>(
        `/projects/${id}/patentability`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setProject(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
      setPatenting(false);
    }
  }

  async function mute(url: string) {
    const res = await tingle<{ project: Project }>(`/projects/${id}/mute`, {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    setProject(res.project);
  }

  async function toggleTingle(on: boolean) {
    setPending(true);
    try {
      const res = await tingle<{ project: Project }>(`/projects/${id}/tingle`, {
        method: "POST",
        body: JSON.stringify({ on, alert_email: email, webhook_url: hook }),
      });
      setProject(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (!project) {
    return (
      <AppChrome>
        <SpideyWait move="run" copy="Opening the file" height={110} />
      </AppChrome>
    );
  }
  const look = project.last_look;
  const budget = project.budget ?? { cap: 50, spent: 0 };
  const status = fileStatus(project);

  return (
    <AppChrome>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <div className="tingle-mast flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span
                className={`tingle-status ${
                  status.kind === "on"
                    ? "tingle-status-on"
                    : status.kind === "looked"
                      ? "tingle-status-looked"
                      : ""
                }`}
              >
                {status.label}
              </span>
              <h1 className="tingle-app-title mt-3">{project.title || "Untitled"}</h1>
              <ClaimText claim={project.claim} />
            </div>
            <div className="tingle-file-actions">
              <button
                type="button"
                disabled={pending}
                onClick={() => void runFirstLook()}
                className="tingle-app-btn"
              >
                {looking ? "Looking…" : look ? "Look again →" : "Run first look →"}
              </button>
              <div className="tingle-patent-cta">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void runPatentability()}
                  className="tingle-app-btn tingle-app-btn-alt"
                  aria-describedby="patent-cta-note"
                >
                  {patenting ? "Scraping patents…" : "Check patentability →"}
                </button>
                <p id="patent-cta-note" className="tingle-patent-cta-note">
                  <span className="tingle-patent-cta-kicker">Takes a few minutes</span>
                  Maps crowded vs new angles. Not a lawyer&apos;s opinion.
                </p>
              </div>
            </div>
          </div>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {looking ? <SpideyWait move="run" copy="Looking" /> : null}
          {patenting ? (
            <SpideyWait move="think" copy="Deep patent scrape — this can take a few minutes" />
          ) : null}

          <section className={`tingle-watch ${project.tingle_on ? "is-live" : ""}`}>
            <div className="tingle-watch-body">
              <span className="tingle-band">
                {project.tingle_on ? "Watching" : "Not watching"}
              </span>
              <p className="tingle-watch-copy">
                {project.tingle_on
                  ? "We’ll email you when a new public page matches this claim."
                  : "We’ll email you when a new public page matches this claim. Nothing is watched until you start."}
              </p>
              <div className="tingle-field">
                <label htmlFor="alert-email" className="tingle-field-label">
                  Alert email
                </label>
                <input
                  id="alert-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.xyz"
                  className="tingle-field-input"
                />
              </div>
              <div className="tingle-field">
                <label htmlFor="alert-hook" className="tingle-field-label">
                  Slack / Discord / webhook (optional)
                </label>
                <input
                  id="alert-hook"
                  type="url"
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  placeholder="https://hooks.slack.com/…"
                  className="tingle-field-input"
                />
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => void toggleTingle(!project.tingle_on)}
                className="tingle-app-btn tingle-watch-btn"
              >
                {project.tingle_on ? "Stop watching" : "Start watching →"}
              </button>
            </div>
            <figure className="sense-stamp" aria-hidden="true">
              <img src="/tingle/sense.png" alt="" />
            </figure>
          </section>

          {look?.piles ? (
            <LookPanel look={look} onMute={(u) => void mute(u)} />
          ) : look ? (
            <p className="text-sm text-[var(--muted)]">
              This look did not store piles. Run it again.
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              No first look yet. Run one to see existing work, live products, and
              what launched this week.
            </p>
          )}

          {project.last_patentability ? (
            <PatentDesk report={project.last_patentability} />
          ) : null}

          <EventFeed events={project.events ?? []} />

          <BudgetBar
            spent={budget.spent}
            cap={budget.cap}
            paused={project.paused}
            pauseCopy={project.pause_copy ?? project.paused_reason}
          />

          <details className="tingle-panel space-y-3">
            <summary className="cursor-pointer text-[0.95rem] font-medium">
              Where this lives
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Default is an encrypted vault. “Keep on GitHub” writes a{" "}
              <code>.tingle/</code> folder to a <strong>private</strong> repo —
              separate from sign-in.
            </p>
            <p className="font-mono text-xs text-[var(--muted)]">
              {project.storage ?? "vault"}
              {project.github_repo ? ` · ${project.github_repo}` : ""}
            </p>
            <div className="flex flex-wrap gap-3">
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/private-repo"
                className="min-w-[10rem] flex-1"
              />
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="GitHub token"
                className="min-w-[10rem] flex-1"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void tingle<{ project: Project }>(`/projects/${id}/storage`, {
                    method: "POST",
                    body: JSON.stringify({
                      backend: "github",
                      repo,
                      token: pat || undefined,
                    }),
                  }).then((r: { project: Project }) => {
                    setProject(r.project);
                    setPat("");
                  })
                }
                className="tingle-app-btn-ghost"
              >
                Keep on GitHub
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void tingle<{ project: Project }>(`/projects/${id}/storage`, {
                    method: "POST",
                    body: JSON.stringify({ backend: "vault" }),
                  }).then((r: { project: Project }) => setProject(r.project))
                }
                className="tingle-app-btn-ghost"
              >
                Back to vault
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                className="tingle-app-btn-ghost"
                onClick={() =>
                  void tingle<{ project: Project }>(`/projects/${id}/budget`, {
                    method: "POST",
                    body: JSON.stringify({ lane: "cheap" }),
                  }).then((r: { project: Project }) => setProject(r.project))
                }
              >
                Cheaper search
              </button>
              <button
                type="button"
                className="tingle-app-btn-ghost"
                onClick={() =>
                  void tingle<{ project: Project }>(`/projects/${id}/budget`, {
                    method: "POST",
                    body: JSON.stringify({ lane: "deep" }),
                  }).then((r: { project: Project }) => setProject(r.project))
                }
              >
                Deeper search
              </button>
              <span className="font-mono text-xs text-[var(--muted)]">
                {project.budget?.lane === "deep" ? "deeper" : "cheaper"}
              </span>
            </div>
          </details>
        </div>

        <aside className="tingle-chat-col">
          <div className="tingle-chat-head">
            <p className="tingle-kicker">Analyst</p>
            <p className="mt-2 text-[0.92rem] leading-snug text-[rgba(243,233,216,0.78)]">
              Ask about the look — or who I am. Look answers stay on pages we already pulled.
            </p>
            <p className="mt-2 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--poster)]">
              {llmOn === true
                ? `AIML on — ${llmModel ?? "chat model"} narrates the look`
                : llmOn === false
                  ? "No model key — assembled from the look"
                  : "Checking voice…"}
            </p>
          </div>
          {look?.piles ? (
            <div className="tingle-chat-tally">
              <PileTally piles={look.piles} />
            </div>
          ) : null}
          <div className="tingle-chat-scroll">
            <ChatLog
              messages={project.messages}
              thinking={pending && !looking}
            />
          </div>
          <form onSubmit={send} className="tingle-chat-compose">
            <label htmlFor="analyst-ask" className="sr-only">
              Ask about what came back
            </label>
            <input
              id="analyst-ask"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about a page that came back"
              className="tingle-field-input min-w-0 flex-1"
            />
            <button type="submit" disabled={pending} className="tingle-app-btn shrink-0">
              {pending && !looking ? "…" : "Send →"}
            </button>
          </form>
        </aside>
      </div>
    </AppChrome>
  );
}
