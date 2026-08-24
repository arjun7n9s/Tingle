"use client";

import Link from "next/link";
import { useState } from "react";
import { Spidey } from "./Spidey";

type Hit = {
  title: string;
  url: string;
  why?: string;
  collector?: string;
  snippet?: string;
};

export type Piles = {
  stand_on_this: Hit[];
  local_lane?: Hit[];
  already_in_the_lane?: Hit[];
  fast_tracker?: Hit[];
  shipped_last_7_days?: Hit[];
  patent_landscape?: Hit[];
  patent_threats?: Hit[];
  prior_art_papers?: Hit[];
  regional_discovered?: Hit[];
};

function hitsFor(piles: Piles, key: keyof Piles): Hit[] {
  if (key === "already_in_the_lane") {
    return piles.local_lane ?? piles.already_in_the_lane ?? [];
  }
  return piles[key] ?? [];
}

function isNoiseMiss(row: string): boolean {
  return /USPTO_ODP_API_KEY|PatentsView|serp_unconfigured|adjunct skipped|TINGLE_C_PATENT not pinned|missing_unlocker_zone/i.test(
    row,
  );
}

/** Full confirmed sentence. Collapse long claims; never store a literal ellipsis cut. */
export function ClaimText({ claim }: { claim: string }) {
  const [open, setOpen] = useState(false);
  const long = claim.length > 280;
  return (
    <div className="mt-2 max-w-2xl">
      <p
        className={`text-[0.98rem] leading-relaxed text-[var(--muted)] ${
          long && !open ? "line-clamp-4" : ""
        }`}
      >
        {claim}
      </p>
      {long ? (
        <button
          type="button"
          className="tingle-claim-more"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Show less" : "Show full claim"}
        </button>
      ) : null}
    </div>
  );
}

export type FileProject = {
  id: string;
  title?: string;
  claim: string;
  created_at: string;
  claim_confirmed: boolean;
  revoked?: boolean;
  tingle_on?: boolean;
  last_look?: { piles?: Piles } | null;
};

export function fileStatus(p: {
  revoked?: boolean;
  tingle_on?: boolean;
  last_look?: unknown;
}): {
  label: string;
  kind: "on" | "looked" | "draft" | "dead";
} {
  if (p.revoked) return { label: "Revoked", kind: "dead" };
  if (p.tingle_on) return { label: "Watching", kind: "on" };
  if (p.last_look) return { label: "Looked", kind: "looked" };
  return { label: "Draft", kind: "draft" };
}

export function FileRail({
  projects,
  activeId,
  variant = "rail",
}: {
  projects: FileProject[];
  activeId?: string;
  variant?: "rail" | "drawer" | "strip";
}) {
  if (projects.length === 0) {
    return (
      <p
        className={
          variant === "rail"
            ? "mt-4 text-sm leading-relaxed text-[var(--muted)]"
            : "mt-4 text-sm leading-relaxed text-[rgba(243,233,216,0.62)]"
        }
      >
        {variant === "strip" ? "No files yet." : "Nothing filed yet. Check an idea, then keep it."}
      </p>
    );
  }
  const list = (
    <>
      {projects.map((p, i) => {
        const status = fileStatus(p);
        const on = activeId === p.id;
        return (
          <li key={p.id} className={variant === "strip" ? "contents" : undefined}>
            <Link
              href={`/tingle/projects/${p.id}`}
              className={`tingle-file${on ? " is-on" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={
                    variant === "rail"
                      ? "font-mono text-[0.62rem] tracking-[0.14em] text-[var(--muted)]"
                      : "font-mono text-[0.62rem] tracking-[0.14em] text-[var(--poster)]"
                  }
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
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
              </div>
              <div className="mt-2 text-[0.95rem] font-medium leading-snug">
                {p.revoked ? "Revoked project" : p.title || "Untitled"}
              </div>
              {variant === "rail" && p.claim && !p.revoked ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{p.claim}</p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </>
  );
  if (variant === "strip") {
    return <ol className="flex min-w-max">{list}</ol>;
  }
  return <ol>{list}</ol>;
}

export function LookPanel({
  look,
  onMute,
}: {
  look: {
    piles: Piles;
    sources_used: string[];
    collectors_failed: string[];
    heal_events?: { stage: string; collector?: string; detail?: string }[];
    quality?: { mock?: boolean; dropped_sample?: string[]; dropped_count?: number };
  };
  onMute?: (url: string) => void;
}) {
  const dropped = look.quality?.dropped_sample ?? [];
  const droppedCount = look.quality?.dropped_count ?? dropped.length;
  const missed = (look.collectors_failed ?? []).filter((row) => !isNoiseMiss(row));
  const heals = look.heal_events ?? [];
  const pendingHeal = heals.some((e) => e.stage.includes("pending"));
  return (
    <div className="space-y-4">
      {look.quality?.mock ? (
        <p className="font-mono text-[0.68rem] tracking-[0.08em] text-[var(--poster)]">
          Demo data — not a live web pull.
        </p>
      ) : null}
      {missed.length ? (
        <aside className="tingle-missed" role="status">
          <p className="tingle-kicker">Collectors that did not return</p>
          <ul>
            {missed.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
          <p>
            An empty pile is fine. A missed collector is not an empty niche — it
            did not come back.
          </p>
        </aside>
      ) : null}
      {pendingHeal ? (
        <aside className="tingle-missed" role="status">
          <p className="tingle-kicker">Heal waiting for approval</p>
          <p>
            A collector failed Zod and proposed a repair. Same <code>c_*</code>{" "}
            before and after — nothing is stored as success until you approve.
          </p>
        </aside>
      ) : null}
      <PileBoard piles={look.piles} onMute={onMute} />
      {droppedCount > 0 ? <SkipPile rows={dropped} total={droppedCount} /> : null}
      <SourcesFooter used={look.sources_used} failed={missed} />
    </div>
  );
}

export function PileBoard({
  piles,
  onMute,
}: {
  piles: Piles;
  onMute?: (url: string) => void;
}) {
  const cols: {
    key: keyof Piles;
    n: string;
    title: string;
    hint: string;
    empty: string;
  }[] = [
    {
      key: "stand_on_this",
      n: "01",
      title: "Existing work",
      hint: "Papers and tools you can learn from.",
      empty: "Nothing to reuse from what came back.",
    },
    {
      key: "already_in_the_lane",
      n: "02",
      title: "Local lane",
      hint: "A live product in your region doing the same job.",
      empty: "No home-region product matched this idea.",
    },
    {
      key: "fast_tracker",
      n: "03",
      title: "Other regions",
      hint: "Shipping somewhere that did not show up in your home search.",
      empty: "No foreign-board match in this look.",
    },
    {
      key: "shipped_last_7_days",
      n: "04",
      title: "New this week",
      hint: "Home-region launches in the last 7 days.",
      empty: "Nothing from the last 7 days.",
    },
    {
      key: "patent_landscape",
      n: "05",
      title: "Patents",
      hint: "Google Patents and office rows for this claim.",
      empty: "No patent cards in this look.",
    },
    {
      key: "patent_threats",
      n: "06",
      title: "Patent threats",
      hint: "Filings that overlap this claim at or above the threshold.",
      empty: "No high-overlap patent in this scrape.",
    },
    {
      key: "prior_art_papers",
      n: "07",
      title: "Prior-art papers",
      hint: "arXiv, OpenAlex, and Crossref rows that matched the claim.",
      empty: "No paper adjunct matched this claim.",
    },
    {
      key: "regional_discovered",
      n: "08",
      title: "Other-region SERP",
      hint: "Yandex / Baidu / Naver hits that already passed claim matching.",
      empty: "No regional SERP match in this look.",
    },
  ];
  return (
    <div className="grid border-2 border-[var(--ink)] lg:grid-cols-4">
      {cols.map((c, i) => (
        <section
          key={c.key}
          className={
            i < cols.length - 1
              ? "border-b-2 border-[var(--ink)] lg:border-b-0 lg:border-r-2"
              : ""
          }
        >
          <div className="flex h-[6.9rem] flex-col border-b-2 border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-[var(--cream)]">
            <p className="font-mono text-[0.58rem] tracking-[0.16em] text-[var(--poster)]">
              {c.n}
            </p>
            <h3 className="mt-1 text-[1.02rem] font-medium">{c.title}</h3>
            <p className="mt-1 min-h-[2.4em] font-mono text-[0.62rem] leading-snug text-[rgba(243,233,216,0.7)]">
              {c.hint}
            </p>
          </div>
          {hitsFor(piles, c.key).length === 0 ? (
            <p className="px-4 py-4 text-sm text-[var(--muted)]">{c.empty}</p>
          ) : (
            <ul className="space-y-4 px-4 py-4">
              {hitsFor(piles, c.key).map((h) => (
                <li key={h.url} className="text-sm">
                  <a
                    href={h.url}
                    className="font-medium underline decoration-[var(--poster)] underline-offset-2 hover:text-[var(--poster)]"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {h.title}
                  </a>
                  <div className="mt-1 text-[var(--muted)]">{h.why ?? h.snippet}</div>
                  {onMute ? (
                    <button
                      type="button"
                      className="mt-1 text-xs underline"
                      onClick={() => onMute(h.url)}
                    >
                      Mute this URL
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function SkipPile({
  rows,
  total,
}: {
  rows: string[];
  total?: number;
}) {
  const n = total ?? rows.length;
  const extra = Math.max(0, n - rows.length);
  return (
    <section className="tingle-skip">
      <header className="tingle-skip-head">
        <div>
          <p className="tingle-kicker mb-1">Didn’t match</p>
          <h3 className="text-[1.02rem] font-medium leading-snug">
            {n === 1
              ? "One page came back that isn’t this claim."
              : `${n} pages came back that aren’t this claim.`}
          </h3>
        </div>
        <p className="tingle-skip-n" aria-label={`${n} skipped`}>
          {String(n).padStart(2, "0")}
        </p>
      </header>
      <p className="mb-3 text-sm leading-relaxed text-[var(--muted)]">
        We still pulled them. They stay off the three piles so an empty pile
        means “no match,” not “we didn’t look.”
      </p>
      {rows.length ? (
        <ol className="tingle-skip-list">
          {rows.map((row, i) => (
            <li key={row}>
              <span className="tingle-skip-idx">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{row}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {extra > 0 ? (
        <p className="mt-3 font-mono text-[0.68rem] tracking-[0.08em] text-[var(--muted)]">
          Showing {rows.length} of {n}. The rest matched the same way — not
          this claim.
        </p>
      ) : null}
    </section>
  );
}

export function SourcesFooter({
  used,
  failed,
}: {
  used: string[];
  failed: string[];
}) {
  return (
    <div className="tingle-source-bar">
      <p className="tingle-kicker mb-2">Sources this turn</p>
      <div className="flex flex-wrap gap-2">
        {used.length ? (
          used.map((s) => (
            <span key={s} className="tingle-chip">
              {s}
            </span>
          ))
        ) : (
          <span className="text-sm text-[var(--muted)]">None recorded.</span>
        )}
      </div>
      {failed.length ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Didn’t return: {failed.join("; ")}
        </p>
      ) : null}
    </div>
  );
}

export function ChatLog({
  messages,
  empty,
  thinking = false,
}: {
  messages: {
    id: string;
    role: "user" | "analyst";
    text: string;
    narrated?: boolean;
    kind?: "house" | "look";
  }[];
  empty?: string;
  thinking?: boolean;
}) {
  if (!messages.length && !thinking) {
    return (
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        {empty ?? "Ask about a page we found. I only talk from this look."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={
            m.role === "user"
              ? "ml-4 max-w-full overflow-x-hidden break-words whitespace-pre-wrap border-2 border-[var(--ink)] bg-[var(--cream)] px-3 py-2.5 text-sm leading-relaxed"
              : "max-w-full overflow-x-hidden break-words whitespace-pre-wrap border-2 border-[var(--ink)] border-l-[5px] border-l-[var(--poster)] bg-[#fffaf2] px-3 py-2.5 text-sm leading-relaxed"
          }
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>{m.role === "user" ? "You" : "Analyst"}</span>
            {m.role === "analyst" && m.kind === "house" ? null : m.role === "analyst" && m.narrated === true ? (
              <span className="tracking-[0.12em] text-[var(--poster)]">Model</span>
            ) : m.role === "analyst" && m.narrated === false ? (
              <span>From the look</span>
            ) : null}
          </div>
          {m.text}
        </div>
      ))}
      {thinking ? (
        <div className="max-w-full border-2 border-[var(--ink)] border-l-[5px] border-l-[var(--poster)] bg-[#fffaf2] px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>Analyst</span>
            <Spidey move="think" height={28} label="Thinking" />
          </div>
          <p className="tingle-dots" aria-label="Thinking">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function PileTally({ piles }: { piles: Piles }) {
  const cells = [
    { n: "01", label: "Existing", count: hitsFor(piles, "stand_on_this").length },
    { n: "02", label: "Local", count: hitsFor(piles, "already_in_the_lane").length },
    { n: "03", label: "Foreign", count: hitsFor(piles, "fast_tracker").length },
    { n: "04", label: "This week", count: hitsFor(piles, "shipped_last_7_days").length },
    { n: "05", label: "Patents", count: hitsFor(piles, "patent_landscape").length },
    { n: "06", label: "Threats", count: hitsFor(piles, "patent_threats").length },
    { n: "07", label: "Papers", count: hitsFor(piles, "prior_art_papers").length },
    { n: "08", label: "Regions", count: hitsFor(piles, "regional_discovered").length },
  ];
  return (
    <div className="grid grid-cols-4 border-2 border-[var(--ink)] sm:grid-cols-8">
      {cells.map((c, i) => (
        <div
          key={c.n}
          className={`px-2 py-2 ${i < cells.length - 1 ? "border-r-2 border-[var(--ink)]" : ""}`}
        >
          <p className="font-mono text-[0.52rem] tracking-[0.14em] text-[var(--poster)]">
            {c.n} {c.label}
          </p>
          <p className="mt-1 text-[1.35rem] font-semibold leading-none">{c.count}</p>
        </div>
      ))}
    </div>
  );
}

export function BudgetBar({
  spent,
  cap,
  paused,
  pauseCopy,
}: {
  spent: number;
  cap: number;
  paused?: boolean;
  pauseCopy?: string;
}) {
  const pct = cap <= 0 ? 100 : Math.min(100, Math.round((spent / cap) * 100));
  return (
    <section className="tingle-panel">
      <h3 className="text-[0.95rem] font-semibold">Budget</h3>
      <p className="mt-1 font-mono text-sm text-[var(--muted)]">
        {spent} / {cap} collector runs
      </p>
      <div className="mt-2 h-2 overflow-hidden border-2 border-[var(--ink)] bg-[var(--cream)]">
        <div
          className="h-full bg-[var(--poster)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      {paused ? (
        <p className="mt-3 text-sm text-[var(--danger)]">
          {pauseCopy ??
            "Watching is paused because it went over budget — adjust here."}
        </p>
      ) : null}
    </section>
  );
}

export function EventFeed({
  events,
}: {
  events: {
    id: string;
    at: string;
    type: string;
    urgency: string;
    entity_key: string;
    sources: { collector: string; url: string }[];
  }[];
}) {
  return (
    <section className="tingle-panel">
      <h3 className="text-[0.95rem] font-semibold">What moved</h3>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Nothing new yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="text-sm">
              <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {e.urgency} · {e.type} · {e.at.slice(0, 16)}
              </div>
              <div>{e.entity_key}</div>
              {e.sources.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  className="block text-[var(--poster)] underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.collector}: {s.url}
                </a>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type Patentability = {
  verdict: string;
  verdict_line: string;
  disclaimer: string;
  memo: string;
  queries: string[];
  mock?: boolean;
  sources_used: string[];
  collectors_failed: string[];
  closest_art: { title: string; url: string; source: string; snippet: string; kind: string }[];
  angles: {
    angle: string;
    coverage: string;
    patent_count: number;
    paper_count: number;
    hits: { title: string; url: string; source: string; kind: string }[];
  }[];
};

export function PatentDesk({
  report,
}: {
  report: Patentability;
}) {
  return (
    <section className="tingle-patent">
      <p className="tingle-kicker">Patentability scrape</p>
      <h3 className="mt-2 text-[1.05rem] font-semibold">{report.verdict_line}</h3>
      <p className="tingle-patent-caution">{report.disclaimer}</p>
      {report.mock ? (
        <p className="mt-2 font-mono text-[0.68rem] tracking-[0.08em] text-[var(--poster)]">
          Demo corpus — not a live USPTO pull.
        </p>
      ) : null}
      <div className="tingle-patent-angles">
        {report.angles.map((a) => (
          <article key={a.angle} className="tingle-patent-angle">
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--poster)]">
              {a.coverage.replaceAll("_", " ")}
            </p>
            <h4 className="mt-1 text-[0.95rem] font-medium">{a.angle}</h4>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {a.patent_count} patents · {a.paper_count} papers in this scrape
            </p>
            <ul className="mt-2 space-y-1">
              {a.hits.slice(0, 4).map((h) => (
                <li key={h.url} className="text-sm">
                  <a href={h.url} target="_blank" rel="noreferrer">
                    {h.title}
                  </a>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {report.closest_art.length ? (
        <div className="mt-4">
          <h4 className="text-[0.95rem] font-medium">Closest art this scrape kept</h4>
          <ul className="mt-2 space-y-2">
            {report.closest_art.slice(0, 8).map((h) => (
              <li key={h.url} className="text-sm leading-snug">
                <a href={h.url} target="_blank" rel="noreferrer">
                  {h.title}
                </a>
                <span className="text-[var(--muted)]"> · {h.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <pre className="tingle-patent-memo">{report.memo}</pre>
      <p className="mt-3 font-mono text-[0.62rem] text-[var(--muted)]">
        Sources: {report.sources_used.join(", ") || "none"}
        {report.collectors_failed.length
          ? ` · missed: ${report.collectors_failed.length}`
          : ""}
      </p>
    </section>
  );
}
