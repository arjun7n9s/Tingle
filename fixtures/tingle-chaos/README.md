# Chaos fixture

A controlled public page for proving self-healing against a **real** DOM
change. `TINGLE_C_CHAOS` is created against `index.html`.

Discovery shape, deliberately the same row shape as the production watch
collector, so breaking this exercises the same code path.

## Selector contract

Field names are frozen — heal prompts name them explicitly.

| `HitRow` field | `index.html` | `broken.html` |
|---|---|---|
| `title` | `.claim-title` | `.product-heading` |
| `url` | `a.hit[href]` | `a.product-link[href]` |
| `snippet` | `.hit-snippet` | `.tagline-text` |
| `published_at` | `.hit-date[datetime]` | `.launch-day[datetime]` |

`article.hit-card` — the row wrapper — is **identical** in both. That is
deliberate. The collector still finds the right number of rows, but the fields
come back empty, which produces per-field validation issues. Those make a far
more precise heal prompt than a bare "empty dataset" would.

## Staging the break

```bash
cp fixtures/tingle-chaos/broken.html fixtures/tingle-chaos/index.html
```

Commit and push. Pages redeploys in about a minute, then run
`npm run prove:tingle-heal`. The collector id is the same before and after.

Restore with `git checkout fixtures/tingle-chaos/index.html`.

## Rules

- Public page. No login, no paywall.
- Every product name and link on it is synthetic. Nothing on the page refers to
  a real company or person.
- The dates are static. That is fine for the extractor spine; the "shipped in
  the last 7 days" pile will want them regenerated or pinned to a fixed clock.
