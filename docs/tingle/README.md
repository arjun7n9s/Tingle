# Tingle

Working name until we ship. Rename is allowed at launch; do not block build on branding.

Tingle is a **watch attached to a piece of work**. A builder drops an idea, a doc, a repo, or a live product. We turn that into a confirmed claim, run a first look against the public web, and — if they turn Tingle on — keep watching so the niche does not fill, clone them, or replace them while they are busy.

Two jobs, always:

1. **First look** — what already exists that they should stand on, not rebuild.
2. **Tingle** — what *moved* since we last looked, interrupted by urgency, not by a calendar.

The analyst speaks **only from scraper / tool output**. If a source did not come back, it says so. It does not invent products, papers, or patents.

## Docs in this folder

| File | What it is |
|---|---|
| [phased-build.md](phased-build.md) | Kickoff: pre-context, locks, phases 0–8, exit criteria |
| [hackathon-fit.md](hackathon-fit.md) | Scrape-Verse requirements mapped onto Tingle — eligibility lock |
| [product.md](product.md) | Screens, signup, vault vs GitHub, chats, Tingle switch, first-look shape |
| [pipeline.md](pipeline.md) | Watch profile, stage × inputs, Studio collectors, events, urgency, budget, dedup |
| [decisions.md](decisions.md) | Locks. Do not reopen without an explicit decision |
| [format.md](format.md) | Public `.tingle/` tree spec (opt-in GitHub storage) |
| [demo.md](demo.md) | Judge demo script (heal beat required) |
| [submission.md](submission.md) | Scraper Studio write-up for the submit form |
| [architecture.md](architecture.md) | Locked pipeline. Patent = Google Patents Search collector |
| [coworker.md](coworker.md) | Brief for a parallel agent with no chat history |
| [coworker-task.md](coworker-task.md) | One isolated task for that agent (Web Unlocker) |

Related (not Tingle-specific): [self-healing scrapers](../self-healing-scrapers.md), [reusable features](../reusable-features.md).

## One-line architecture

```
artifact → stage → watch profile → first look (baseline) → optional Tingle (diff + urgency) → email / feed
```

Identity is email-first. Data lives in an **encrypted vault by default**. A private GitHub `.tingle/` tree is opt-in.
