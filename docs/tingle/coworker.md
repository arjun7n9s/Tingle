# Tingle — coworker brief (no chat history)

You are a second coding agent on **ScrapeVerse**. You have the repo, not the prior Cursor thread. Read this file, then [coworker-task.md](coworker-task.md). Do not invent extra work.

## Two products

| | Changelog Radar | Tingle |
|---|---|---|
| What | Self-healing npm / GitHub Releases maintainer radar | Claim watch for builders |
| Code | `packages/shared`, `mcp-server`, `web-ui` | `packages/tingle-core` (+ `web-ui` `/tingle`) |
| Status | **Done. Do not break.** | Under construction |
| Specs | `README.md` | `docs/tingle/` |

Tingle is not a reskin of Changelog Radar. Steal the heal client and Zod tripwire. Do not copy `MaintainerSignalSchema`, the `npm | github_releases | chaos` enum, CVE framing, or package.json audits.

Canonical rules: repo-root `AGENTS.md`. If docs disagree, `docs/tingle/hackathon-fit.md` and `docs/tingle/decisions.md` win. Pipeline lock: `docs/tingle/architecture.md`.

## What Tingle does

Builder drops a pitch / doc / repo / URL. We confirm **one claim sentence**, scrape public HTML into piles, optionally keep watching (`tingleTick`) and alert on diffs.

Analyst speaks **only from tool JSON**. Empty extractor ≠ empty niche. Heal the collector. Never invent products, papers, or patents.

## Hard rules (non-negotiable)

1. **Never `bdata scraper create` if a `TINGLE_C_*` pin already exists** in `.env`. Create costs 5–25 min and credits; a new id orphans every pointer.
2. Heal **in place**. Same `c_*` before and after. `refactor_template` → poll → `resume_automation_job`.
3. Proof collectors (already pinned — do not recreate):

   | Env | Id | Target |
   |---|---|---|
   | `TINGLE_C_SEARCH` | `c_mt3k9kgdv5dj23xxd` | Discovery, https://dev.to/t/indiehackers |
   | `TINGLE_C_WATCH` | `c_mt3jjp0qjjjt1thr3` | Discovery, https://www.uneed.best/ |
   | `TINGLE_C_CHAOS` | `c_mt3jbbz21pal4p4vgp` | Chaos fixture |

   Extra pasted URLs reuse Watch `{url}`. Never a fourth collector for a paste.
4. Patent product (2026-08-24 lock): **one** Google Patents **Search** collector, `TINGLE_C_PATENT`. Not yet pinned. **Do not create it unless the human says create.** Do not build eight office collectors.
5. USPTO Open Data Portal JSON is **adjunct only** (`USPTO_ODP_API_KEY`).
6. AIMLAPI is the **extractor normalizer** (`normalize.ts`), before Zod. **Not** the analyst. Do not add chat that can invent competitors.
7. Unattended ticks **never** auto-approve heals unless `TINGLE_HEAL_AUTO_APPROVE=1` (CI).
8. Public HTML only. No login walls, paywalls, PII. Uploaded files are not scrapes.
9. Zod failure = incident = heal. Never store invalid rows as success.
10. No `Co-Authored-By` trailers. No secrets in git.

## Identifier map (match the file you edit)

Do not “fix” names globally. Drift exists. Copy identifiers from the file in front of you.

Typical in `packages/tingle-core` today:

- `loadTingleConfig`, `TingleConfig`, `CollectorKey`
- Env: `TINGLE_C_SEARCH`, `TINGLE_C_WATCH`, `TINGLE_C_CHAOS`, `TINGLE_C_PATENT`
- `scrapeAndValidate`, `BrightDataClient`, `mockRowsFor`
- `firstLook`, `tingleTick`, `planLanes`, `googlePatentsUrl`
- Piles: `stand_on_this`, `local_lane`, `already_in_the_lane` (alias), `fast_tracker`, `shipped_last_7_days`, `patent_landscape`
- LLM: `completeJson`; AIMLAPI via `AIMLAPI_KEY`

Imports of local TS use the `.js` extension (NodeNext ESM).

## Pipeline (locked)

```
claim + fingerprints + geo
  → owned collectors (search / watch / chaos / Google Patents)
  → AIMLAPI normalize (messy text only)
  → Zod gate
  → piles (no LLM)
  → diff + urgency
  → alert
```

Bright Data has **no patent dataset**. Web Unlocker markdown, MCP extract, Yandex/Baidu/Naver SERP, and Browser API are **later adjuncts**, not replacements for Studio listings.

## What not to touch

- Changelog Radar packages and proofs
- Auto-approve heal defaults
- Analyst inventing hits
- Creating collectors
- Dataset Marketplace as the proof path
- A global “patent Bing” with no Studio pin

## How to work

1. Read `AGENTS.md` + `docs/tingle/architecture.md` + `docs/tingle/coworker-task.md`.
2. Stay inside the task file’s file list.
3. Run `npm test -w packages/tingle-core` (or the package’s `tsx --test`) before you stop.
4. Do not commit unless the human asks.
