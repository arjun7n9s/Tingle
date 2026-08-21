# Proof artifacts

| Path | From |
|---|---|
| `live/` | `npm run prove:tingle-live` — every pinned collector returns schema-valid rows |
| `heal/` | `npm run prove:tingle-heal` — break, validation failure, repair, retry, same collector id |

Every file is stamped `"mode": "mock"` or `"mode": "live"`. The two runs produce
the same shape, so without the stamp a fixture run is indistinguishable from
evidence that a real collector works.

**Mock artifacts are gitignored.** They are regenerable in seconds and prove
nothing about a live collector. Only live runs are committed.

API tokens are stripped before anything is written. Collector ids are kept —
they are not secrets, and they are the point: the heal artifact exists to show
the id is identical before and after a repair.
