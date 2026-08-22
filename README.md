# Tingle

A **claim watch** for builders.

You drop the work — a rough pitch, a spec, a repo URL, a live product. Tingle
turns it into **one confirmed sentence**: the claim. Then it runs a **first
look** across the public web and tells you three things:

- **Stand on this** — what already exists that you should build on, not rebuild
- **Already in the lane** — live products doing the same job
- **Shipped in the last 7 days** — what just landed

Turn the watch on and it keeps going: same job, run against a baseline,
reporting only what *moved*. You hear about it when it's urgent, not because
it's Monday.

No viability score. No market sizing. The analyst reports what the collectors
returned and nothing else — if a source didn't come back, it says so.

## Why the extractor matters

A scraper works on day one and quietly dies after a redesign. The data is still
on the page; the extractor is what broke. Left alone, that failure reads as
*"nothing is in your lane"* — the most dangerous possible false negative for a
watch product.

So validation is a tripwire, not documentation. Every row is schema-checked
before anything downstream sees it. An empty required field is an **incident**:
it triggers an in-place repair of the extractor, keeping the same collector id,
so schedules and callers pointing at it keep working. Invalid rows are never
stored as success.

## Setup

```bash
npm install
cp .env.example .env      # .env is gitignored — never commit it
```

Authenticate the scraper CLI (no global install needed):

```bash
npx -p @brightdata/cli bdata login
```

Paste your three collector ids into `.env` (`TINGLE_C_SEARCH`, `TINGLE_C_WATCH`,
`TINGLE_C_CHAOS`). This repo's pinned ids live in [AGENTS.md](AGENTS.md) — clones
create their own once (see [docs/collectors.md](docs/collectors.md)) and never
create them again.

| Env var | Type | Target |
|---|---|---|
| `TINGLE_C_SEARCH` | **Discovery** on a fixed listing (not `{q}`) | [DEV `indiehackers` tag](https://dev.to/t/indiehackers) |
| `TINGLE_C_WATCH` | **Discovery** | [Uneed](https://www.uneed.best/) daily launches |
| `TINGLE_C_CHAOS` | **Discovery** | [`fixtures/tingle-chaos/`](fixtures/tingle-chaos/) — a fixture built to be broken |

**Create once, then never again.** Creating a collector takes 5-25 minutes,
costs credits, and a fresh id orphans everything pointing at the old one.

## Mock vs live

Leave `BRIGHT_DATA_API_TOKEN` empty, or set `TINGLE_MOCK=1`, and the whole state
machine — scrape, validate, fail, heal, retry — runs against fixtures. No
token, no credits, same code path; only the transport changes.

Mock is for development. It is not evidence that a live collector works.

## Running it

```bash
npm run api            # http://127.0.0.1:8788  (was `serve` in early notes)
npm run first-look request.json   # same pipeline, no browser
```

Sign up with an email and a password. Two doors: **Quick chat** (one look, no
project, no memory) and **New project** (confirm a claim, keep the result). A
project page shows the three piles, a tool-gated analyst, a collapsible sources
footer, Mute, a Tingle switch, and an event feed.

The analyst answers only from stored rows. Ask it who wins the market and it
tells you no tool covers that.

`POST /first-look` and `GET /health` remain available as JSON, so the pipeline
is still drivable without the UI.

## Heal a collector

Heal repairs the extractor **in place**. The collector id does not change.

```bash
# Preview (default). Read the proposed diff before anything is committed.
npx -p @brightdata/cli bdata scraper heal "$TINGLE_C_CHAOS" \
  "<zod issues, verbatim>. Keep the same JSON field names." \
  --url "$TINGLE_CHAOS_URL"

npx -p @brightdata/cli bdata scraper approve "$TINGLE_C_CHAOS" \
  --url "$TINGLE_CHAOS_URL" --auto-save
```

`--auto-approve` is for unattended jobs only (`TINGLE_HEAL_AUTO_APPROVE=1` or
`npm run prove:tingle-heal -- --auto-approve`). A blind approve can commit a
wrong schema to a live collector. Same `c_*` before and after — that is the
whole reliability story.

Full prompts: [docs/collectors.md](docs/collectors.md). Staging a DOM break:
[fixtures/tingle-chaos/README.md](fixtures/tingle-chaos/README.md).

## Proofs

```bash
TINGLE_MOCK=1 npm test
TINGLE_MOCK=1 npm run prove:tingle-shell
TINGLE_MOCK=1 npm run prove:tingle-loop
TINGLE_MOCK=1 npm run prove:tingle-vault
TINGLE_MOCK=1 npm run prove:tingle-dedup
TINGLE_MOCK=1 npm run prove:tingle-heal

# Live (local only — needs a token and pinned ids). Do not commit the dump.
npm run prove:tingle-live
npm run prove:tingle-heal -- --auto-approve
```

Artifacts land under `docs/proof/tingle/`, stamped `mode: "mock" | "live"` so a
mock run can never be mistaken for a live one. Tokens are never written to disk.

`prove:tingle-live` stays on your disk (`docs/proof/tingle/live/` is gitignored)
because evidencing a live scrape means recording someone else's URLs and titles.

The heal proof **is** committed: it runs against our synthetic chaos fixture,
and the collector id is identical before and after. Latest live pass:
[`docs/proof/tingle/heal/heal-2026-08-22T11-05-53-999Z.json`](docs/proof/tingle/heal/heal-2026-08-22T11-05-53-999Z.json).
Shape reference with invented rows:
[`docs/proof/tingle/schema.example.json`](docs/proof/tingle/schema.example.json).

## Public data only

Tingle reads **public HTML**. No login walls, no paywalls, no personal data.
Files a user uploads are their own and are never scraped. The chaos fixture is
entirely synthetic — every name and link on it is invented for testing.

## Demo and submission

- Recording script: [docs/demo.md](docs/demo.md)
- How Scraper Studio was used: [docs/submission.md](docs/submission.md)

## Repo map

| Path | Role |
|---|---|
| `packages/tingle-core/src/schema` | `HitRow` and heal-event schemas — the frozen field contract |
| `packages/tingle-core/src/bd` | Scraper Studio client, validation gate, heal loop |
| `packages/tingle-core/src/http.ts` | Product API (auth, first look, Tingle tick, vault) |
| `packages/tingle-core/src/scripts` | prove:live / heal / shell / loop / vault / dedup |
| `fixtures/tingle-chaos` | Breakable fixture, served over GitHub Pages |
| `docs/collectors.md` | Creating and pinning the three collectors |
| `AGENTS.md` | Rules for coding agents working here, including pinned `c_*` |

## CI

Push and pull-request runs use `TINGLE_MOCK=1` — tests plus the prove scripts,
no token. An optional workflow (`Chaos heal`) can run the live chaos collector
on a schedule or via `workflow_dispatch`. That job needs
`BRIGHT_DATA_API_TOKEN` as a GitHub Actions secret and
`TINGLE_HEAL_AUTO_APPROVE=1` (the unattended flag). It will not run a live heal
without both.
