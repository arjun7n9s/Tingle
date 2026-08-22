# Agent rules — Tingle

Canonical rules file. `CLAUDE.md` and `.cursor/rules/tingle.mdc` point here.

## What this is

A **claim watch** for builders. Someone drops work — a pitch, a doc, a repo
URL, a live product. We confirm **one sentence** (the claim), run a **first
look** across the public web, and optionally keep watching: diff against a
baseline, classify what moved, and interrupt by urgency rather than by
calendar.

Two jobs, always: what already exists that they should build on, and what
*changed* since we last looked.

## Build order

The build order (extractor first, then claim JSON, then product, then watch,
then vault, then dedup) is done through Phase 6. Phase 7 is the demo pack.

1. Own the collectors, validate their output, heal them in place, trigger from
   code.
2. Claim → first look → three piles, as JSON. No UI required.
3. Product shell on top of that JSON.
4. The watch loop: schedule, diff, classify, urgency, email.
5. Encrypted storage, dedup, mute, claim lock.
6. Proof artifacts, clone README, demo script, optional CI heal.

## Hard rules

### Collectors

1. **Never create a collector for a target that already has a pinned id.**
   Check `.env` for `TINGLE_C_SEARCH`, `TINGLE_C_WATCH`, `TINGLE_C_CHAOS`
   first. Creating takes 5-25 minutes, costs credits, and a new id orphans
   every downstream pointer.

   Pinned on this workspace — do not create again, do not swap ids:

   | Env | Id | Type / target |
   |---|---|---|
   | `TINGLE_C_SEARCH` | `c_mt3k9kgdv5dj23xxd` | Discovery, https://dev.to/t/indiehackers |
   | `TINGLE_C_WATCH` | `c_mt3jjp0qjjjt1thr3` | Discovery, https://www.uneed.best/ |
   | `TINGLE_C_CHAOS` | `c_mt3jbbz21pal4p4vgp` | Discovery, chaos fixture |

   Inactive duplicate Search `c_mt3jjqpa1vbu522epb` — leave it. A clone pastes
   its own ids into `.env`; it must not run `create` for these three targets.
2. Heal repairs **in place**. The collector id is identical before and after —
   that is the entire reliability story. `refactor_template` → poll progress →
   `resume_automation_job`.
3. State the scraper **type** in every create prompt (Search / Sitemap /
   Discovery / Discovery+PDP / PDP). Type determines output cardinality, and an
   ambiguous prompt means paying the build cost twice.
4. `HitRow` field names are **frozen**. Heal prompts name them explicitly, so
   a rename silently breaks repair.
5. Heal defaults to preview then explicit approval. Auto-approve only behind a
   flag for unattended jobs, and still record the preview. A blind approve can
   commit a wrong schema to a live collector.

### Targets

6. Long-tail targets only. If a maintained pre-built extractor already covers a
   site, we are not learning anything by owning selectors for it — pick a
   different target. Hosted scraper marketplaces and dataset products are not
   the core data path.
7. Public HTML only. No login walls, no paywalls, no personal data. A file the
   user uploaded is their file, not a scrape.
8. Collectors run in production via `POST /dca/trigger` (then poll the
   dataset). The CLI is how humans and agents author and prove them. A vendor
   dashboard is not the workflow.
9. The app consumes JSON. It never authors selectors.

### Data honesty

10. Validation is a tripwire, not documentation. A failed parse is an incident
    that starts a repair. **Never store invalid rows as success.**
11. An empty extractor is not an empty niche. If a collector did not return,
    say so and heal it. Never fill the hole with model knowledge.
12. The analyst speaks only from tool output. It does not invent products,
    papers, or patents. No viability score, no market sizing.
13. Collapse multi-source hits to one event with several sources before
    anything is emailed. A URL hash tells you a page changed; it does not tell
    you how many distinct things are in the lane.
14. Every project has a hard spend cap. Pause the watch when it is exceeded,
    and say why.

### Secrets

15. `.env` is gitignored and stays that way. No tokens in code, commits, proof
    artifacts, or recordings. Collector ids are not secrets; API tokens are.

## Conventions

- npm workspaces, TypeScript ESM (`"type": "module"`, NodeNext). Import local
  files with the `.js` extension.
- zod `^3.24.2` — do not mix in zod 4.
- Mock-by-default: an empty token or `TINGLE_MOCK=1` runs the full state
  machine on fixtures. One code path, two transports — never a separate demo
  app, and mock is never evidence of live collector usage.
- Proof artifacts are stamped `mode: "mock" | "live"`. Never file a mock run
  under a live-proof path.

## Repo hygiene

- No third-party company names, personal names, or credits in committed files.
- Do not add `Co-Authored-By` trailers to commits.
