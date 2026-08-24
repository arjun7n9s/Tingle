# Collectors

Three owned Scraper Studio collectors. Create each **once**, pin the returned
id in `.env`, and never create it again — a new id orphans everything that
pointed at the old one.

Verified against CLI `0.3.5`.

```bash
alias bdata="npx -p @brightdata/cli bdata"   # optional, per shell session
bdata login                                   # or set BRIGHTDATA_API_KEY
bdata budget                                  # confirms auth works
```

## Before you create anything

- **Already pinned?** If `.env` has real `c_*` ids, stop. The prompts below are
  for a clone that has never created collectors. This repo's ids are in
  [AGENTS.md](../AGENTS.md).
- **Is the target long-tail?** If a maintained pre-built extractor already
  covers the site, owning selectors for it teaches you nothing and the target
  is the wrong choice. Pick something no one maintains for you.
- **Is it public?** No login walls, no paywalls, no personal data.
- **State the scraper type** in the description. Type decides output
  cardinality, and an ambiguous prompt means paying the build cost twice.

Create is slow by design — typically 5-15 minutes, up to 25 on hard targets.

## Command shape

```
bdata scraper create <url> <description>
```

Both arguments are required, and `description` is capped at **500 characters**.
Useful flags: `--name <name>`, `-o <file>` to capture the envelope,
`--timeout <seconds>` (default 600).

> Never pipe a long create or heal into `head` — SIGPIPE kills the poller
> mid-job. Write to a file with `-o` and read the file. Always quote URLs;
> shells glob on `?` and `&`.

## 1. Watch collector

The long-tail target: a public launch board, changelog, docs index, or niche
directory whose entries carry dates. Dates are what make the "shipped in the
last 7 days" pile and the baseline diff possible.

**Locked here:** Discovery on https://www.uneed.best/

```bash
bdata scraper create "https://www.uneed.best/" \
  "Scraper type: Discovery. Extract every listed launch as a row with these
   exact field names: title, url, snippet, published_at, source_domain.
   published_at is an ISO date or null. Use plain-language extraction so
   self-healing can repair selectors later. Public pages only." \
  --name tingle-watch -o watch-create.json
```

Put the returned id in `TINGLE_C_WATCH` and the target in `TINGLE_WATCH_URL`.

## 2. Search collector

A **fixed public listing**, not a site search box. `/search?q=` endpoints are
near-universally disallowed in robots.txt or render results client-side, so
Studio has no DOM to learn from. The claim is matched against listing rows in
our code after the scrape.

**Locked here:** Discovery on https://dev.to/t/indiehackers

`TINGLE_SEARCH_URL_TEMPLATE` with `{q}` is unused for this collector. Leave it
unset.

```bash
bdata scraper create "https://dev.to/t/indiehackers" \
  "Scraper type: Discovery. Extract each post on the listing as a row with
   these exact field names: title, url, snippet, published_at, source_domain.
   published_at is an ISO date or null. Plain-language extraction. Public
   pages only." \
  --name tingle-search -o search-create.json
```

Set `TINGLE_C_SEARCH` and `TINGLE_SEARCH_URL`.

## 3. Chaos collector

Points at the fixture in `fixtures/tingle-chaos/`, which exists to be broken.
Its selector contract is documented in that folder's README.

```bash
bdata scraper create "https://arjun7n9s.github.io/Tingle/fixtures/tingle-chaos/" \
  "Scraper type: Discovery. Each article.hit-card is one row. Extract title
   from .claim-title, url from the a.hit href, snippet from .hit-snippet,
   published_at from the .hit-date datetime attribute, and source_domain from
   the url host. Use these exact field names. Public page." \
  --name tingle-chaos -o chaos-create.json
```

Set `TINGLE_C_CHAOS`.

## Running

```bash
bdata scraper run "$TINGLE_C_WATCH" "<watch url>" --pretty
bdata scraper run "$TINGLE_C_CHAOS" "$TINGLE_CHAOS_URL" --pretty
```

`run` routes through `/dca/trigger` and polls the dataset — the same path the
application uses in production. `--sync` exists for single URLs but carries a
server-side 25-50s cap.

## Healing

Heal repairs the extractor **in place**. The collector id does not change, so
nothing downstream needs updating.

```bash
bdata scraper heal "$TINGLE_C_CHAOS" \
  "<zod issues, verbatim>. Keep the same JSON field names. Fix selectors for
   the current DOM." \
  --url "$TINGLE_CHAOS_URL"

bdata scraper approve "$TINGLE_C_CHAOS" --url "$TINGLE_CHAOS_URL" --auto-save
```

Details that matter:

- The heal prompt is capped at **1000 characters**. Build it from the actual
  validation issues — paths and messages — not a vague "it broke". Vague
  prompts rewrite the scraper; issue-derived prompts repair selectors.
- `heal` **stops at the approval gate by default** and shows a preview. That is
  the right default: a blind approve can commit a wrong schema to a live
  collector. `--auto-approve` is for unattended jobs only.
- `approve` needs `--auto-save` to persist the healed template. Approving
  without it can leave the repair uncommitted.
- Heal also *extends* a working collector — "also extract the tag list" — with
  the same id. Schema growth does not require a new collector.

## Pinning

Once the three ids exist, they live in `.env` and are treated as immutable.
[AGENTS.md](../AGENTS.md) forbids coding agents from creating a collector when
a pinned id is already present. Collector ids are not secrets; the API token
is.
