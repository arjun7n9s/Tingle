# Tingle chaos fixture

Controlled public page for proving Bright Data Scraper Studio **self-healing**
against a real DOM change. `TINGLE_C_CHAOS` is created against `index.html`.

Discovery shape, deliberately the same row shape as the Uneed watch collector,
so breaking this exercises the same code path production uses.

## Selector contract

Field names are frozen forever — heal depends on them.

| HitRow field | Selector in `index.html` | Selector in `broken.html` |
|---|---|---|
| `title` | `.claim-title` | `.product-heading` |
| `url` | `a.hit[href]` | `a.product-link[href]` |
| `snippet` | `.hit-snippet` | `.tagline-text` |
| `published_at` | `.hit-date[datetime]` | `.launch-day[datetime]` |

`article.hit-card` (the row wrapper) is **unchanged** between the two. That is
deliberate: the collector still finds the right number of rows, but the fields
come back empty. Empty required field = heal incident, and per-field Zod issues
produce a far more precise heal prompt than "empty dataset" would.

## Staging the break

```bash
# from repo root — swap the served page, then redeploy
cp fixtures/tingle-chaos/broken.html fixtures/tingle-chaos/index.html
```

Commit and push; GitHub Pages redeploys in about a minute. Then run
`npm run prove:tingle-heal`. Same `c_*` before and after.

To restore, `git checkout` the good `index.html`.

## Rules

- Public page, no login, no paywall.
- Every product name and link on the page is synthetic. Nothing here refers to
  a real company.
- Dates are static. Phase 1 does not care; Phase 2's "shipped in the last
  7 days" pile will want them regenerated or frozen against a fixed clock.
