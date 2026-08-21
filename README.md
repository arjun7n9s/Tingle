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

Then create the three collectors once and pin their ids in `.env`. Full
walkthrough with the exact prompts: [docs/collectors.md](docs/collectors.md).

| Env var | Type | Target |
|---|---|---|
| `TINGLE_C_SEARCH` | Search | keyword built from the claim |
| `TINGLE_C_WATCH` | Discovery / Sitemap | a long-tail launch board or changelog with dated entries |
| `TINGLE_C_CHAOS` | Discovery | [`fixtures/tingle-chaos/`](fixtures/tingle-chaos/) — a fixture built to be broken |

**Create once, then never again.** Creating a collector takes 5-25 minutes,
costs credits, and a fresh id orphans everything pointing at the old one.
[AGENTS.md](AGENTS.md) makes this a hard rule for coding agents working here.

## Mock vs live

Leave `BRIGHT_DATA_API_TOKEN` empty, or set `TINGLE_MOCK=1`, and the whole state
machine — scrape, validate, fail, heal, retry — runs against fixtures. No
token, no credits, same code path; only the transport changes.

Mock is for development. It is not evidence that a live collector works.

## Proofs

```bash
npm run prove:tingle-live   # all three collectors return schema-valid rows
npm run prove:tingle-heal   # break → validation fails → heal → approve → retry
```

Artifacts land under `docs/proof/`, stamped `mode: "mock" | "live"` so a mock
run can never be mistaken for a live one. Tokens are never written to disk.

The heal proof is the one that matters: the collector id is identical before
and after the repair, and no application code changes. To stage a real DOM
break, see [fixtures/tingle-chaos/README.md](fixtures/tingle-chaos/README.md).

## Public data only

Tingle reads **public HTML**. No login walls, no paywalls, no personal data.
Files a user uploads are their own and are never scraped. The chaos fixture is
entirely synthetic — every name and link on it is invented for testing.

## Repo map

| Path | Role |
|---|---|
| `packages/tingle-core/src/schema` | `HitRow` and heal-event schemas — the frozen field contract |
| `packages/tingle-core/src/bd` | Scraper Studio client, validation gate, heal loop |
| `packages/tingle-core/src/scripts` | `prove:tingle-live`, `prove:tingle-heal` |
| `fixtures/tingle-chaos` | Breakable fixture, served over GitHub Pages |
| `docs/collectors.md` | Creating and pinning the three collectors |
| `AGENTS.md` | Rules for coding agents working in this repo |

## Status

Early. The extractor spine is the current focus; the product surface — claim
confirmation, the three piles, the watch loop, email — comes after it, and
deliberately not before.
