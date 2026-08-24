# Tingle

A **claim watch** for builders.

You drop work — a pitch, a spec, a repo URL, a live product, uploaded files.
Tingle collapses that into **one confirmed sentence** (the claim), scrapes
public HTML, and returns piles of what already exists. Turn the watch on and
it diffs against that baseline: you hear about what *moved*, by urgency, not
by calendar.

No viability score. No TAM. The analyst reports scraper output only. If a
lane did not come back, it says so.

Live UI: [tingle-coral.vercel.app](https://tingle-coral.vercel.app)

```
pitch / files / URL
        │
        ▼
  one-sentence claim   ← you confirm before any paid scrape
        │
        ▼
  Studio collectors ──► Zod HitRow ──► heal in place (same c_*)
  + adjuncts (HN, SERP, Unlocker, OpenAlex, …)
        │
        ▼
  piles  →  baseline
        │
        ▼
  optional watch tick  →  clustered events  →  mail / webhook
```

## Pipeline

### 1. Confirm the claim

`proposeClaim` turns the pitch into one sentence. Credits are not spent until
`confirmed: true`. Fingerprints from that sentence rank listing rows later —
the Search collector is a **fixed Discovery listing**, not `{q}` on a search
box. `/search` endpoints are usually robots-disallowed or client-rendered, so
Studio would learn nothing.

### 2. Collect public HTML

Three **owned** Scraper Studio collectors. Create each once, pin the `c_*` in
`.env`, never create again. A new id orphans every schedule and heal pointer.

| Env | Type | This workspace |
|---|---|---|
| `TINGLE_C_SEARCH` | Discovery | [DEV `indiehackers` tag](https://dev.to/t/indiehackers) |
| `TINGLE_C_WATCH` | Discovery | [Uneed](https://www.uneed.best/) daily launches |
| `TINGLE_C_CHAOS` | Discovery | [`fixtures/tingle-chaos/`](fixtures/tingle-chaos/) — built to break |

Production scrape is `POST /dca/trigger`, then poll the dataset. The CLI is
for humans and agents to author and prove collectors. Extra user URLs reuse
Watch. **SERP and Web Unlocker are adjuncts**, never a fourth Studio collector.

Optional adjuncts (skip cleanly when unset): Hacker News, arXiv, OpenAlex,
Crossref, USPTO, GitHub REST, Bright Data SERP (`site:` patent offices), Web
Unlocker for public patent **detail** pages. `patents.google.com` is skipped
on Unlocker — that host is not supported. Dataset Marketplace streams, if
enabled, are labeled and never treated as eligibility.

### 3. Validate, then heal in place

Every row is aliased (`tagline` → `snippet`, …) then gated by Zod. Empty
required field or empty dataset = **incident**, not “empty niche.” Invalid
rows are never stored as success.

Heal: `refactor_template` → poll progress → `resume_automation_job`. The
collector id is identical before and after. Default is preview, then explicit
approve. Auto-approve is a flag for CI/cron only.

### 4. Piles

Hits that survive claim ranking land in:

| Pile | Meaning |
|---|---|
| `stand_on_this` | docs, repos, papers you should build on |
| `already_in_the_lane` / `local_lane` | live products doing the same job |
| `shipped_last_7_days` | dated launches in the last week |
| `fast_tracker` | foreign boards (not your home region) |
| `patent_landscape` / `patent_threats` | office listings; high lexical overlap |
| `prior_art_papers` | papers, not products |
| `regional_discovered` | SERP engines you queried (Yandex / Baidu / Naver tagged by **engine**, not result host) |

An empty pile is honest. The code does not invent products, papers, or patents
to fill it.

### 5. Watch

A confirmed first look writes a **baseline** (URL + content hashes). Later
ticks scrape the same lanes, classify what is new, cluster the same entity
across sources (one event, several URLs), and interrupt by urgency (`now` /
`soon` / `note` / `quiet`). Mute tokens persist. Each project has a hard
spend cap; exceeding it pauses the worker and says why.

Storage defaults to an encrypted vault (`.data/tingle/`, gitignored). Opt-in:
a `.tingle/` tree on a private GitHub repo (`profile.yml`, `baseline.json`,
events). Stealth omits the pitch from that tree.

## HitRow (frozen)

Heal prompts name these fields. Renaming one silently breaks repair.

```ts
{
  source: "search" | "watch" | "chaos" | "patent" | "regional",
  title: string,          // min 1 — empty means the extractor died
  url: string,            // valid URL
  snippet: string,        // min 1
  published_at: string | null,
  source_domain: string
}
```

Schema: [`packages/tingle-core/src/schema/hits.ts`](packages/tingle-core/src/schema/hits.ts)

## Setup

Node 20+. `.env` is gitignored; never commit tokens. Collector ids are not secrets.

```bash
npm install
cp .env.example .env
npx -p @brightdata/cli bdata login
```

Paste three `c_*` ids into `.env`. **If ids are already pinned, do not run
`bdata scraper create`.** Create takes 5–25 minutes, costs credits, and a
fresh id orphans the old one. Clone walkthrough: [docs/collectors.md](docs/collectors.md).
Pinned ids for this workspace: [AGENTS.md](AGENTS.md).

Empty `BRIGHT_DATA_API_TOKEN` or `TINGLE_MOCK=1` runs the full state machine
on fixtures. Same code path, different transport. Mock is not evidence that a
live collector works.

```bash
npm run api            # http://127.0.0.1:8788
npm run dev:ui         # http://localhost:3000 → /tingle
npm test
npm run first-look request.json
```

UI: email/password (GitHub/Google OAuth optional). **Quick chat** is one look,
no project. **New project** confirms a claim and keeps piles, analyst, sources,
mute, and the watch switch. The Next app proxies `/tingle-api/*` to the API
so the session cookie stays same-origin. On Vercel set `TINGLE_API_PROXY`
before the build.

## HTTP

| Method | Path | What |
|---|---|---|
| `GET` | `/health` | liveness |
| `POST` | `/auth/signup` `/login` `/logout` `/demo` | session |
| `POST` | `/first-look` | pipeline without a project |
| `POST` | `/quick-chat` | one-shot look |
| `POST` | `/projects` | create |
| `POST` | `/projects/:id/first-look` | confirmed look + baseline |
| `POST` | `/projects/:id/tingle` | turn watch on/off |
| `POST` | `/projects/:id/tick` | one watch pass |
| `POST` | `/projects/:id/mute` | persist mute tokens |
| `POST` | `/projects/:id/analyst` | answers only from stored rows |
| `POST` | `/internal/tick` | cron (`TINGLE_CRON_SECRET`) |

## Proofs

```bash
npm run prove:tingle-live      # three collectors, schema-valid rows
npm run prove:tingle-heal      # break → Zod fail → heal → same c_* → retry
npm run prove:tingle-shell     # product API, piles, analyst refusals
npm run prove:tingle-loop      # tick: one new event, not a reprint
npm run prove:tingle-vault     # envelope encryption; claim redacted from dumps
npm run prove:tingle-dedup     # multi-source cluster + mute + claim lock
npm run prove:tingle-watchdog  # scheduled tick path (mock unless flagged live)
```

CI runs the mock proofs on every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
Optional: chaos heal on a schedule, hourly `POST /internal/tick`.

Artifacts are stamped `"mode": "mock" | "live"`. Tokens are stripped. Collect
dumps (`docs/proof/live/`, `docs/proof/tingle/live/`) stay local — a live
scrape is other people's titles. The **heal** artifact is committed: the
fixture is ours, and `collector_id_before === collector_id_after` is the claim.

- Shape: [docs/proof/schema.example.json](docs/proof/schema.example.json)
- Live chaos heal: [docs/proof/tingle/heal/](docs/proof/tingle/heal/)
- Staging a DOM break: [fixtures/tingle-chaos/README.md](fixtures/tingle-chaos/README.md)

## Layout

```
packages/tingle-core/     extractor, jobs, HTTP API  (@tingle/core)
  src/schema/             HitRow, events, watch profile
  src/bd/                 Studio client, Zod gate, heal, Unlocker
  src/jobs/               firstLook, tick, patents, SERP, uploads
  src/scripts/            prove:*  (never create collectors if pinned)
web-ui/                   Next app, routes under /tingle
fixtures/tingle-chaos/    public heal target (GitHub Pages)
docs/collectors.md        create + pin + heal CLI
AGENTS.md                 rules for coding agents
```

Public HTML only. No login walls, paywalls, or personal data. Uploads are
the user's files, not a scrape. The chaos page is fully synthetic.

## Rules (short)

Full text: [AGENTS.md](AGENTS.md).

1. Never `scraper create` when `TINGLE_C_*` is already pinned.
2. Heal in place. Same collector id.
3. `HitRow` field names are frozen.
4. Validation failure is an incident. An empty extractor is not an empty niche.
5. The analyst does not invent. No market sizing.
6. Collapse multi-source hits before anything is emailed.
7. Pause at the spend cap and say why.
8. No tokens in git, artifacts, or recordings.
