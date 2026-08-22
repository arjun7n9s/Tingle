# Proof artifacts

| Path | From | Committed? |
|---|---|---|
| `tingle/heal/heal-*.json` | `npm run prove:tingle-heal` (live chaos) | **yes** — synthetic fixture |
| `tingle/live/` | `npm run prove:tingle-live` | no — local only |
| `*-mock-*.json` | either script in mock mode | no |
| `tingle/schema.example.json` | hand-written | yes |

Older `heal/heal-live-*.json` files predate the `tingle/` prefix. Same rule:
only chaos-heal evidence is kept.

## Why only the heal proof is committed

Evidencing a live collect means recording the URLs and titles of whatever was
scraped — you cannot show a scrape worked without showing someone else's
content. So collect runs stay on disk. Anyone cloning this repo can produce
their own in one command.

The heal proof is different: it runs against
[`fixtures/tingle-chaos/`](../../fixtures/tingle-chaos/), a page in this repo
whose every row is invented. Nothing in that artifact belongs to anyone else,
and it is the round trip that actually needs proving — a broken extractor
repaired in place, with the collector id unchanged.

`schema.example.json` shows the collect artifact's shape using entirely made-up
rows, so the format is documented without publishing a real run.

## Reading an artifact

Every file is stamped `"mode": "mock"` or `"mode": "live"`. Both modes produce
the same shape, so without the stamp a fixture run is indistinguishable from
evidence that a real collector works. Mock runs prove the pipeline; they prove
nothing about a collector.

The heal artifact carries `collector_id_before`, `collector_id_after`, and
`same_collector_id`. Those agreeing is the whole point — a repair that issued
a new id would break every schedule and caller pointing at the old one.

API tokens are stripped before anything is written. Collector ids are kept:
they are not secrets, and they are the evidence.
