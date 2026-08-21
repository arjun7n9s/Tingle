# Chaos fixture

A controlled public page for proving self-healing against a **real** DOM change,
served at
https://arjun7n9s.github.io/Tingle/fixtures/tingle-chaos/

Discovery shape, deliberately the same row shape as the production watch
collector, so breaking this exercises the same code path.

## Two variants that alternate

`index.html` is the served page. It is always a copy of one of the two
variants, and the two differ **only** in their field selectors:

| `HitRow` field | `variant-a.html` | `variant-b.html` |
|---|---|---|
| `title` | `.claim-title` | `.product-heading` |
| `url` | `a.hit[href]` | `a.product-link[href]` |
| `snippet` | `.hit-snippet` | `.tagline-text` |
| `published_at` | `.hit-date[datetime]` | `.launch-day[datetime]` |

There is no permanent "good" and "broken" file, because after a heal the
collector matches whatever it was just repaired against. Restoring the old
markup would simply break it again in the other direction. So the demo
**alternates**: whichever variant `index.html` currently holds, copy the *other*
one over it to stage the next break.

Check which one is live:

```bash
diff -q fixtures/tingle-chaos/index.html fixtures/tingle-chaos/variant-a.html \
  && echo "serving variant-a" || echo "serving variant-b"
```

## Staging a break

```bash
# if index.html is variant-b, swap in variant-a (and vice versa)
cp fixtures/tingle-chaos/variant-a.html fixtures/tingle-chaos/index.html
git commit -am "Stage the DOM break on the chaos fixture"
git push
```

Pages redeploys in well under a minute. Confirm the new markup is actually
being served before running the proof — the collector reads the live URL, not
your working copy:

```bash
curl -s https://arjun7n9s.github.io/Tingle/fixtures/tingle-chaos/ | grep -c claim-title
```

Then `npm run prove:tingle-heal`. The collector id is identical before and
after.

## What the break actually does

The intent was for `article.hit-card` (the row wrapper) to stay identical in
both variants so the collector would still find four rows with empty fields,
producing precise per-field validation issues.

In practice the generated extractor keys on the inner structure too, so
renaming the field classes makes it return **zero rows**, and the validation
issue is `empty dataset — collector returned 0 rows`. The heal still works
from that, and zero rows is arguably the more important case to catch: an empty
result is exactly what a dead extractor and an empty niche look like from the
outside, and conflating them is the failure this whole layer exists to prevent.

Recorded here because the fixture comment used to claim otherwise.

## Rules

- Public page. No login, no paywall.
- Every product name and link on it is synthetic. Nothing on the page refers to
  a real company or person.
- The dates are static. Fine for the extractor spine; the "shipped in the last
  7 days" pile will want them regenerated or pinned to a fixed clock.
