# CLAUDE.md

Read [AGENTS.md](AGENTS.md) — it is the canonical rules file for this repo and
applies in full.

Quick orientation:

- Tingle is a **claim watch** for builders: confirm one sentence, run a first
  look across the public web, then optionally keep watching and interrupt by
  urgency.
- `packages/tingle-core` is the extractor spine: `HitRow` schema, the Scraper
  Studio client, the validate-and-heal loop. Build this before any UI.
- Never create a collector when a `TINGLE_C_*` id is already pinned in `.env`.
- Heal in place, same collector id. Preview then approve by default.
- Validation failure is an incident, not a log line. An empty extractor is not
  an empty niche.
- Long-tail targets, public HTML only, no secrets in git.
- No third-party names or `Co-Authored-By` trailers in commits.
