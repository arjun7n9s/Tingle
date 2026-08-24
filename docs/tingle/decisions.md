# Tingle — locked decisions

Working name **Tingle** until we ship. Public rename is allowed at launch. Do not block build on branding. See [Name](#name-at-launch) before using Tingle on a US storefront.

## v1 locks

1. **Encrypted vault is the default.** Repo-local (`.tingle/` on their private GitHub) is a toggle. Fast, not principled, is the door.
2. **Identity and data source are separate.** Email (+ optional Google / GitHub login). GitHub repo is a New Project toggle or a pasted URL, not the signup button.
3. **Two chats, one feed.** Quick chat (no memory). Project analyst (project memory). Tingle urgency log is a feed. Sources used this turn = collapsible footer.
4. **Budget per project, hard cap, visible.** Pause Tingle when exceeded. Cheap lane default. Deep lane opt-in / Now-only.
5. **Claim-level dedup.** Multi-source hits collapse to one event with `sources[]`. URL hash is for “did this page change,” not for counting threats.
6. **First-look quality is instrumented.** Dogfood until piles are not junk. Use a relevance threshold as a **regression kill-switch** after there is a sample — not a fake “median ≥5” gate with zero users.
7. **Day-0 third pile = “Shipped in the last 7 days.”** Not a diff. Not “moved recently.”
8. **ChatGPT / Google AI Mode scrapers are best-effort**, labeled, not in the first-look quality bar.
9. **Analyst rule:** only tool output. Never invent figures, products, papers, or patents. If a tool didn’t cover it, say so (HomeStar bar).
10. **One product, one buyer for v1:** indie hackers and small teams. No vertical packs.
11. **Scrape-Verse fit is a product lock, not a side doc.** Studio at the core, long-tail targets, real `create`+`run`, heal on empty fields, `c_*` triggered as an API, public pages only, secrets out of the repo. Matrix: [hackathon-fit.md](hackathon-fit.md).

## Name (at launch)

Tingle is fine as an internal / pre-ship name. Before a public US brand, talk to a lawyer. This is **not** legal advice; it is why we may rename:

| What | Status |
|---|---|
| **TINGLE** — Tinglemore, serial 97771351, reg. 7371394 | Live (30 Apr 2024). Classes **9, 38, 42**. Software for location / social / dating. |
| **TINGLE** — Yaniv Gershom, serial 99847921 | Pending (filed 27 May 2026). Class 9, humming / breathing app. |
| App Store “Tingle” | Dating apps. Google “tingle app” is dating. |
| PH / HN | No idea-watch product named Tingle. Phrase **“prior art alert”** is unused as a product name. |

Same word, overlapping software classes, consumer internet already maps Tingle → dating. Internal codename can stay. Public product name should be decided at ship.

## What Tingle is not

- Not Unbuilt (one score, then goodbye). Unbuilt can be a **source**, not the product.
- Not PatSeer / IamIP (we do not certify legal novelty or FTO).
- Not `r14dd/patent` (dev-tool registries, no watch) — closest honest CLI; different job.
- Not idea-reality-mcp (agent one-shot) — steal the “reality signal” instinct, not the surface.
- Not a construction “competitor alert for builders.”
- Not a weekly newsletter pretending to be spider-sense.

## Actual comps (the idea, not our three unused phrases)

Searched: `site:twitter.com "prior art alert" OR "novelty radar" OR "competitor alert for builders"` plus Reddit / HN / GitHub. Those **phrases** are empty. The **job** is not.

| Comp | What it is |
|---|---|
| [Unbuilt](https://www.unbuilt.me/) | “Don’t build what already exists.” One-shot Dig across many live sources. |
| [r14dd/patent](https://github.com/r14dd/patent) | CLI prior-art for code ideas. Open / Crowded / Saturated. Finds prior art, never certifies absence. |
| [mnemox-ai/idea-reality-mcp](https://github.com/mnemox-ai/idea-reality-mcp) | MCP reality-check vs GitHub, HN, npm, PyPI, Product Hunt. |
| Preuve / TestYourIdea / similar | SaaS idea validators, scores, TAM. The slop version of the same nerve. |
| Patent-watch SaaS | IamIP, PatSeer, USPTO PAAS — lawyers, not indie builders. |

Indie Hackers has the **feeling** ([every idea is taken](https://www.indiehackers.com/post/every-idea-is-taken-its-not-possible-to-build-a-startup-anymore-9759242ac7), [reinventing wheels](https://www.indiehackers.com/post/why-are-we-all-reinventing-wheels-76c647bc81)). Nobody named it Tingle.

Nudge.ai is relationship intel (Affinity). It is not a dead idea-watch tool. Do not cite it as a category corpse.

## Distribution (remember, don’t block v1)

The category has many one-shot validators. Building is not finding users.

Useful later, not ship blockers:

- After the vault path works, the `.tingle/` format can be documented.
- First-look screenshots only **with permission**.
- Pick one community and be the watch for that community before widening.

Do not ship a public `.tingle/` spec **before** the product as a delay dressed as GTM.

## Corrections we already made

These were wrong in an earlier draft and are **not** the plan:

- Repo-local as the default (loses people who have no GitHub for the idea).
- GitHub login as both identity and data source.
- Four conversation surfaces (quick chat, project chat, urgency-as-chat, follow-ups-as-chat).
- Weekly-only Tingle.
- Invented per-query dollar amounts as locked economics.

## Bright Data doctrine

**For Tingle as a Scrape-Verse project (and until we explicitly reopen this):**

Scraper Studio is the core. We `create` collectors for sites the 800+ library does **not** already cover. We heal those collectors. We trigger them. Pre-built GitHub/Reddit/Amazon-class scrapers are not the hero — official rule: that question **disqualifies**.

Direct public JSON APIs stay direct. They are adjuncts. They are not a substitute for a `c_*`. SERP (if a zone is configured) is also adjunct: it finds URLs; landing pages reuse the pinned Watch collector with `{url}`. Never a fourth collector for a paste.

**Patent re-lock (2026-08-24, amended 2026-08-25):** one Google Patents **Search** collector (`TINGLE_C_PATENT`). USPTO Open Data Portal JSON is adjunct. Per-office Studio collectors and Yandex/Baidu/Naver SERP are later. Bright Data has no patent dataset — do not look for one. Studio's crawler and Web Unlocker both refuse `patents.google.com` (`this endpoint is not supported`) on every account we have tested — do not create a second Patents `c_*` and do not Unlocker-fetch that host. When the collector returns no cards, SERP `site:patents.google.com` (optional second-account token `TINGLE_PREMIUM_API_TOKEN`, never mixed into Studio) may discover public patent URLs as a labeled adjunct. Detail markdown stays Unlocker on hosts that actually return pages (WIPO / USPTO HTML), capped. Pipeline: [architecture.md](architecture.md).

ChatGPT / Google AI Mode **datasets** stay off the qualifying path (still “best-effort / later”).

Details: [hackathon-fit.md](hackathon-fit.md), [pipeline.md](pipeline.md), [self-healing scrapers](../self-healing-scrapers.md).
