# Submission notes — how Scraper Studio was used

Paste or adapt this into the Scrape-Verse submit form field for Scraper Studio.

Tingle is a claim watch. Scraper Studio is the core data path, not a sidebar.
Eligibility lock: [hackathon-fit.md](hackathon-fit.md).

## What we built with Studio

Three owned collectors, created once, pinned, never recreated:

| Lane | Studio type | Target | Pinned id |
|---|---|---|---|
| Search | **Discovery** on a fixed public listing (not a `{q}` search page — those were robots-blocked / client-rendered) | https://dev.to/t/indiehackers | `c_mt3k9kgdv5dj23xxd` |
| Watch | **Discovery** | https://www.uneed.best/ | `c_mt3jjp0qjjjt1thr3` |
| Chaos | **Discovery** | Hosted fixture (`fixtures/tingle-chaos/`) | `c_mt3jbbz21pal4p4vgp` |

Long-tail on purpose. A judge asking "why not the pre-built GitHub / Reddit /
Amazon / Product Hunt scraper?" gets: we didn't use those.

## How jobs run

Authoring is the CLI (`bdata scraper create` / `heal` / `approve`). Production
Tingle jobs are `POST /dca/trigger` then poll the dataset — same collector ids.
The Tingle UI never writes selectors. It consumes `HitRow` JSON
(`title`, `url`, `snippet`, `published_at`, `source_domain`).

## Self-healing

Zod is a tripwire. Invalid or empty extractor output is an incident, not "the
niche is empty." Heal is `refactor_template` → progress →
`resume_automation_job`. **Same `c_*` before and after.** Preview + explicit
approve by default; `--auto-approve` / `TINGLE_HEAL_AUTO_APPROVE=1` only for
unattended jobs, and the preview is still logged.

Live chaos heal proof (synthetic page, so it is safe to commit):
`docs/proof/tingle/heal/heal-2026-08-22T11-05-53-999Z.json`.
`same_collector_id` is true. Tingle application code did not change.

## What is not the proof path

HN Algolia (and optional USPTO Open Data) are labeled adjuncts. They are not
Studio, and they are not a fallback that hides a dead extractor. Bright Data
Dataset Marketplace and the pre-built site library are out of the qualifying
path.

## Public data

Public HTML only. No login walls, paywalls, or personal data. User-uploaded
files are the user's files, not a scrape. API tokens are not in git; collector
ids are pinned in `AGENTS.md` because they are not secrets.
