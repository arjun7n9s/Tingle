# Tingle — phased build (kickoff)

Read this before writing code. Specs live next to this file; this document is the **order of work**, **exit criteria**, and **what already exists in this repo**.

If you only skim: Tingle is not Changelog Radar. Changelog Radar is a self-healing *npm/GitHub maintainer* radar already in this workspace. Tingle is a **claim watch** for builders. Steal the heal client. Do not reskin the radar.

---

## 0. Pre-context (required reading)

### What we are building

A builder drops work (vague pitch, doc/patent, GitHub URL, product URL). We confirm **one sentence (the claim)**, run a **first look** on the public web, and optionally turn on **Tingle**: keep watching, diff against baseline, interrupt by **urgency** (Now / Soon / Note / Quiet), email + an event feed.

The analyst speaks **only from tool/scraper output**. Empty extractor ≠ empty niche. Heal the collector; do not invent competitors.

Working name: **Tingle** until ship. Public rename is allowed later ([decisions.md](decisions.md)).

### Docs (do not fork these in chat; follow them)

| File | Role |
|---|---|
| [README.md](README.md) | One-liner |
| [hackathon-fit.md](hackathon-fit.md) | **Eligibility.** Studio core, long-tail, heal, `c_*` as API |
| [product.md](product.md) | Screens, auth, vault vs GitHub, two chats + feed |
| [pipeline.md](pipeline.md) | Watch profile, stage × inputs, events, budget, dedup |
| [decisions.md](decisions.md) | Locks. Do not reopen without an explicit decision |
| [self-healing-scrapers.md](../self-healing-scrapers.md) | CLI + API for create / run / heal / approve |
| [reusable-features.md](../reusable-features.md) | Patterns: Zod tripwire, heal prompt from issues, mock-by-default |

Official brief: [Into the Scrape-Verse](https://www.wemakedevs.org/hackathons/scrape-verse).

### Non-negotiable locks (copy into agent rules)

1. Scraper Studio is the **proof path**. `bdata scraper create` + `run` + `heal` + `approve`. Same `c_*` after heal.
2. Long-tail only for qualifying scrapes. If a judge would ask “why not the GitHub/Reddit/Amazon scraper?”, change the target.
3. `POST /dca/trigger` (poll dataset) is how Tingle jobs run. CLI is how we prove and how agents author scrapers.
4. Terminal / coding agent authors scrapers. Tingle UI **consumes JSON**. Bright Data dashboard = glance at `c_*` only.
5. Public HTML only. No login, paywall, PII scrapes. User uploads are not scrapes.
6. Vault default. GitHub `.tingle/` is opt-in, not signup.
7. Identity ≠ data. Email (+ optional Google/GitHub **login**). Repo URL is a project toggle.
8. Two chats: Quick chat (no memory), project analyst (memory). Urgency is a **feed**. Sources = collapsible footer.
9. No viability score, no TAM. Three piles: Stand on this / Already in the lane / Shipped in the last 7 days.
10. Analyst never invents hits. If a collector fails, say it failed, then heal.
11. Claim-level dedup before mail. Budget hard cap, pause Tingle when exceeded.
12. Secrets never in git or demo video.

### This workspace today

This git root is **Changelog Radar** (`web-ui`, `mcp-server`, `packages/shared`): npm + GitHub Releases + chaos page, Zod gate, heal, mock mode.

| Steal | Do not steal as Tingle |
|---|---|
| `BrightDataClient` trigger / poll / `triggerHeal` / `pollHealProgress` / `approveHeal` | `Source = npm \| github_releases \| chaos` as the product |
| Zod-as-tripwire, heal prompt from validation issues | `MaintainerSignalSchema` |
| Mock-when-no-token | Radar UI, CVE framing, package.json audit |
| Chaos fixture + `prove:live` / `prove:heal` pattern | GitHub **Studio** collector as a qualifying target (pre-built exists) |
| Pin `c_*` in env + agent rules | Treating Unlocker/datasets as the core |

**Recommended layout:** keep Changelog Radar working. Add Tingle as a sibling (e.g. `packages/tingle-core`, `apps/tingle` or `web-ui` routes under `/tingle`) that **genericizes** the Bright Data client (collector id in, not `Source` enum of three maintainer sites).

Do not start by rewriting the moon-walk landing into Tingle marketing.

### Accounts and credits

1. Bright Data account. Billing code `wemakedevs` (lowercase) for hackathon credits. Published scrape price: **$1.50 / 1,000 page loads**; free tier 5,000 credits/month + $50 promo.
2. `npx -p @brightdata/cli bdata login` (or `BRIGHT_DATA_API_TOKEN` / `BRIGHTDATA_API_KEY` as the CLI docs specify — match whatever the installed CLI accepts; do not commit it).
3. Optional later: Resend/Postmark/SES for mail, Google OAuth, GitHub OAuth (login vs repo are **separate** apps/scopes).

Create is slow (5–15 min, up to 25). Never `create` again for a target that already has a `c_*`.

### Qualifying collectors we will own

Say the **type** in the create prompt.

| Env / pin name | Type | Purpose |
|---|---|---|
| `TINGLE_C_SEARCH` | **Discovery** on a **fixed listing** (not `{q}`) | **Locked:** [DEV `indiehackers` tag](https://dev.to/t/indiehackers). See below. |
| `TINGLE_C_WATCH` | **Discovery** (listing) | **Locked:** [Uneed](https://www.uneed.best/) homepage / daily launches. |
| `TINGLE_C_CHAOS` | **PDP** or Discovery | Hosted fixture we can break to demo heal. |

CLI 0.3.5 is `create <url> <description>` — both required. Google/Bing/HN/PH search URLs are DQ (pre-built). Indie Hackers `/search?q=` is **out**: `robots.txt` disallows it, results are client-rendered, Studio already failed at `output_schema_generator`. Do **not** retry IH with a JS hint (burns ~15 min on a known-bad target).

**`TINGLE_C_SEARCH` pick (re-locked):** `https://dev.to/t/indiehackers`

This is **not** keyword search on the site. It is a server-rendered tag listing. Pitch-only first look **ranks those rows in `piles.ts`** against the claim fingerprints (Phase 2). Unset `TINGLE_SEARCH_URL_TEMPLATE` `{q}` — runtime URL is the same listing.

| | |
|---|---|
| Create / run URL | `https://dev.to/t/indiehackers` |
| SSR | HTTP 200, story blocks in HTML (no wait-for-JS) |
| robots | `/t/` and `/latest` allowed. **Do not** use `dev.to/search?q=*` (disallowed). |
| Pre-built? | **No.** `brightdata.com/products/web-scraper/dev-to` **404**. |
| Why not skip Search | Chaos+Watch already prove heal. Search is the pitch-only / Quick chat lane. Shipping Phase 1 on two collectors degrades that door. |

Create prompt:

```text
Scraper type: Discovery.
URL: https://dev.to/t/indiehackers
Listing of public posts tagged indiehackers. Server-rendered cards. Extract each story: title, url (article), snippet (subtitle or first line), source_domain "dev.to", published_at if shown else null.
Do not require login. Do not scrape /search. Public pages only. Plain-language extraction so Self-Healing can repair selectors.
```

**`TINGLE_C_WATCH` pick (locked 2026-08-22):** indie launch board → **Uneed** (`https://www.uneed.best/`).

| Check | Result |
|---|---|
| Public HTML, no login to *read* today’s launches | Yes. Homepage lists “Best products launching today” with names, taglines, vote counts. |
| Dates for “Shipped in the last 7 days” | Yes — it’s a **daily** launch board. Treat scrape day (and any on-page launch date) as `published_at`. |
| Bright Data pre-built? | **No.** `brightdata.com/products/web-scraper/uneed` is **404**. They *do* ship Product Hunt, GitHub, Y Combinator, Wellfound. Uneed is the PH-shaped board without the PH scraper. |
| Judge test | “Why not Product Hunt?” → PH is in the library. Uneed is not. |

Do **not** point Watch at Product Hunt, GitHub, YC, Wellfound, or Reddit. OpenAlternative is a catalog (last-commit dates), not a launch board — worse for the 7-day pile. Changelog-of-a-named-SaaS is plan B if Uneed’s DOM is too hostile; still must pass the same pre-built check.

Create prompt (Discovery, keep these field names):

```text
Scraper type: Discovery.
URL: https://www.uneed.best/
Extract each product on the current launches listing: title, url (product page), snippet (tagline), source_domain "uneed.best", published_at (launch date if shown, else today's date for "launching today" rows).
Public pages only. Plain-language extraction so Self-Healing can repair selectors.
```

Optional later (still long-tail, still Studio): extra watch URLs each get their own `c_*` or one Discovery+PDP collector with a URL input. Do not add Bright Data GitHub/Reddit/Amazon/PH **datasets**.

**Adjunct APIs** (never the only path, never Unlocker-as-markdown): HN Algolia, arXiv API, USPTO/PatentsView JSON, GitHub **REST** for a README they pasted.

**Create prompts:** use the locked Search (IH) and Watch (Uneed) blocks above. Chaos:

```text
Scraper type: PDP.
URL: <hosted fixtures/tingle-chaos/ index>
Extract: title from .claim-title, url from link.hit, snippet from .hit-snippet, published_at from .hit-date.
```

Do not use Bright Data’s keyword-only Search type via CLI 0.3.5 — `create` requires a URL. DEV `/t/indiehackers` Discovery is the stand-in; claim matching is in `piles.ts`.

### Proof artifacts vs third-party content (locked)

A live Search/Watch run **is** other people’s titles and URLs. That cannot live in git if the repo rule is no third-party references.

| Artifact | Git |
|---|---|
| `docs/proof/tingle/heal/` chaos heal (our fixture HTML, our field names) | **Commit.** This is the eligibility proof. |
| `docs/proof/tingle/live/` Search + Watch JSON | **Gitignore.** Run `prove:tingle-live` locally; README says how. |
| Synthetic `docs/proof/tingle/schema.example.json` | **Commit.** Fake titles (`Example Hit`), real field names only. |

Do not commit live Uneed/IH dumps “anyway.” Do not skip chaos proof — that would leave the repo with no scrape evidence at all.

### Canonical schemas (implement in phase 1; do not invent parallel JSON)

**Collector row** (Search + Watch + Chaos — one Zod object, `source` discriminates):

```ts
HitRow = {
  source: "search" | "watch" | "chaos"
  title: string
  url: string (url)
  snippet: string
  published_at: string | null
  source_domain: string
}
```

Required fields non-empty: `title`, `url`, `snippet`. Empty required field = **heal incident**.

**Watch profile** — [pipeline.md](pipeline.md). Persist this; everything else is derived.

**Event** after first look / Tingle:

```ts
TingleEvent = {
  id, project_id, at
  type: "already_exists" | "building" | "just_shipped" | "paper_patent" | "ai_default" | "discussion"
  urgency: "now" | "soon" | "note" | "quiet"
  claim_fingerprint: string
  entity_key: string          // normalized title/url cluster
  content_hash: string
  sources: { collector: string, url: string }[]
  hit_ids: string[]
}
```

Same paper on two sites = **one** event, multiple `sources`.

### Analyst contract (UI copy, once)

> I only report what the scrapers returned for this project. I do not invent products, papers, or patents. If a source did not come back, I will say it did not come back.

Follow-ups may only call tools (re-filter hits, re-run a collector, mute). No “I think I’ve seen an app called…” from model weights.

### Demo you are building toward (do not skip heal)

1. Confirm claim.
2. Agent `create` + `run` (Search and/or Watch). Show JSON.
3. First look: three piles from that JSON (+ adjunct APIs **labeled**).
4. Break chaos (or catch nulls) → `heal` → `approve` → `run`. **Same `c_*`.** Piles still render.
5. Tingle on: second run diffs baseline; one event in feed and/or email.

If 4 is missing, the project does not fit the brief.

---

## How to use these phases

- Finish a phase’s **Exit** before starting the next. Partial UI without a live `c_*` is a trap.
- Mock mode (`BRIGHT_DATA_API_TOKEN` empty) is allowed for UI, **not** for claiming Studio usage.
- Each phase lists **Out of scope** so we do not sneak in vault-on-GitHub or AI-Mode datasets early.

Suggested agent rule snippet:

```text
Tingle: read docs/tingle/ before coding. Studio long-tail only. Pin c_*.
Heal on Zod fail. Same collector id. Analyst never invents hits.
```

---

## Phase 0 — Kickoff hygiene

**Goal:** Anyone (human or agent) can run the repo and talk to Bright Data without leaking secrets or `create`-spamming.

**Do**

- Copy `.env.example` → `.env`. Gitignore `.env`.
- Document: `npx -p @brightdata/cli bdata login`, pin collector ids, `wemakedevs` credits.
- Add `.cursor/rules` (or `AGENTS.md`): never recreate collectors; Tingle vs Changelog Radar; public data only.
- Decide package layout (`packages/tingle-core` + UI). Do not delete Changelog Radar proofs.
- Host a **Tingle chaos** static page (new fixture, not the maintainer chaos schema) so Bright Data can reach it.

**Exit**

- [x] Fresh clone + README section “Tingle” with env vars listed
- [x] `bdata --version` works via npx
- [x] Chaos page public URL in env
- [x] Agent rules file exists and forbids `create` when `c_*` is set

**Out of scope:** product UI, auth, email.

---

## Phase 1 — Extractor spine (this *is* the hackathon)

**Goal:** Own `c_*`s, validate, heal in place, trigger from code. No Tingle product yet.

**Do**

1. `bdata scraper create` for Search, Watch (long-tail URL), Chaos. Save ids to env. **Confirm Watch target is not in the 800+ library.**
2. Genericize Bright Data client: `collectorId: string` not `Source` of npm/github/chaos. Keep trigger, poll, heal, approve. Heal prompt clip 1000 chars. Build prompt from Zod issue paths.
3. `scrapeAndValidate(collector, inputs) → HitRow[]`. On fail: do not store success; emit heal event; `triggerHeal` → poll → approve (flag for auto) → retry **same id**.
4. Scripts: `prove:tingle-live` writes Search + Watch + Chaos rows under `docs/proof/tingle/live/` (**gitignored**). `prove:tingle-heal` writes chaos heal timeline under `docs/proof/tingle/heal/` (**committed**). Add `docs/proof/tingle/live/` to `.gitignore`.
5. **GitHub Actions cron: out of Phase 1** (locked). Heal is proved by `prove:tingle-heal`. Actions (chaos → validate → heal → re-run, `--auto-approve` behind a flag, secrets in Actions) wait for **Phase 7**, when a remote exists and tokens are not in git.

**CLI proof (also record this later):**

```bash
bdata scraper run $TINGLE_C_SEARCH --pretty
bdata scraper run $TINGLE_C_WATCH <url> --pretty
bdata scraper heal $TINGLE_C_CHAOS "<zod issues; keep field names>" --url $CHAOS_URL
bdata scraper approve $TINGLE_C_CHAOS --url $CHAOS_URL
```

**Exit**

- [x] Three pinned `c_*`s, never recreated in the session
- [x] Live JSON from Search and Watch on disk
- [x] Heal demo: same chaos `c_*` before and after; Tingle app code (even a script) unchanged
- [x] Invalid rows never written as a successful first look

**Out of scope:** piles UI, login, “prefer marketplace scrapers.”

---

## Phase 2 — Claim → first look (headless)

**Goal:** From inputs to three piles in JSON, no pretty app required.

**Do**

- Parse toggles: pitch, docs (PDF/md text extract — no scrape), links, GitHub REST README, patent number via USPTO JSON, ignore list, watch-list URLs.
- Stage + extra question ([product.md](product.md)). User-provided; do not infer and hide it.
- Rewrite + **confirm claim** (one sentence). Refuse to spend credits until confirm. Claim lock: edits are explicit and rebuild fingerprints.
- Build fingerprints / must_match / ignore.
- Job: trigger `TINGLE_C_SEARCH` on `https://dev.to/t/indiehackers` (fixed listing). **Match the claim in `piles.ts`** — do not interpolate `{q}` into DEV search (robots deny `/search?q=*`). Trigger `TINGLE_C_WATCH` as well.
- Adjunct: HN + arXiv + USPTO as labeled extra rows. GitHub REST only if GitHub toggle on.
- Map hits → piles:
  - **Stand on this** — libraries/docs/papers to reuse (heuristic: docs, github.com via REST, arXiv, “library/tool” titles). Prefer precision over recall.
  - **Already in the lane** — live products / same job, not last-7-days-only.
  - **Shipped in the last 7 days** — `published_at` (or equivalent) within 7 days. **Not a diff.** Label empty pile honestly.
- Persist `baseline.json` (hit ids, urls, content hashes).
- Log first-look quality: hit count per pile, which collectors returned, Zod failures. No fake “median ≥5” ship gate.

**Exit**

- [x] CLI or HTTP: `POST /first-look` with pitch-only and with URL+pitch
- [x] Response includes piles, `sources_used[]`, `collectors_failed[]`
- [x] Empty third pile possible without looking like a bug
- [x] Model does not add a fourth competitor that was not in JSON

**Out of scope:** chat UI, Tingle schedule, GitHub vault.

---

## Phase 3 — Product shell

**Goal:** HomeStar-like analyst chrome on top of phase 2.

**Do**

- Auth: **email + password** first. Session cookie. Google/GitHub login **optional** and does not request `repo` scope.
- Home: Quick chat | New project | project list. Skip marketing landing.
- Quick chat: stateless thread, Search collector, same analyst contract, **Turn into project** carries the claim only (ask stage on convert).
- New project: one screen — stage, extra question, input toggles, claim confirm, Run first look.
- Project page: three piles, project analyst (history = this project’s hits + claim), sources footer, Mute URL → `ignore[]`.
- Copy: not “validate my idea.”

**Exit**

- [x] Signup with email, create project, see piles from live or recorded fixture
- [x] Quick chat has no Tingle switch
- [x] Two conversation surfaces only
- [x] Follow-up “what did Search return?” works; “who will win the market?” → tool doesn’t cover it

**Out of scope:** Tingle emails, budget UI can be a stub (`budget.spent = page_loads`).

---

## Phase 4 — Tingle loop

**Goal:** Switch + email + feed + urgency. Diff, not reprint.

**Do**

- Switch off by default. On → require `alert_email` (pre-fill account email).
- Scheduler (in-process interval or cron worker): if switch on and budget remaining → trigger same collectors → validate/heal → diff vs baseline.
- Classify events ([pipeline.md](pipeline.md) types). Urgency by stage:
  - Starting: Now = someone **shipped** the sentence
  - Building: Now = near-clone / rival shipped the feature they’re mid-build on
  - Shipped: Now = knockoff, filing in lane (wording: “same verbs,” not “you infringe”)
- Digest floor daily|weekly for Note (+ Soon rollup). **Now** emails immediately. Quiet digest is valid: “nothing close.”
- Feed UI: events, not chat. Budget bar. Pause copy: *Tingle is paused because it exceeded its budget — adjust here.*
- Count Bright Data page loads (or credits if the API exposes them) toward the cap.

**Exit**

- [x] Two runs: second run with a new chaos/watch row produces one event, not a full reprint
- [x] Now event sends email (even Mailhog/Ethereal in dev)
- [x] Cap hit pauses the worker
- [x] `POST /dca/trigger` is the production path (not dashboard “run”)

**Out of scope:** SMS, LinkedIn posting, marketplace scrapers.

---

## Phase 5 — Vault (default storage)

**Goal:** Pitch is not a searchable ideas table.

**Do**

- Encrypt profile, artifacts, baseline, events at rest (per-user key or envelope encryption). Metadata we must keep in the clear: `user_id`, `project_id`, `email`, `c_*` list, budget counters.
- Promise in UI: we see the claim **while a job runs**; we do not keep a plaintext pitch as a product dataset.
- Stealth flag: still scrape public web; never write claim to a public gist or log.

**Exit**

- [x] DB dump / admin query does not show raw pitch
- [x] Jobs still run; revoke = leftover email + `c_*` + budget only

**Out of scope:** GitHub `.tingle/` sync (phase 8).

---

## Phase 6 — Dedup, mute, claim lock (ship-blockers)

**Goal:** One threat, many sources. No accidental retarget.

**Do**

- Cluster hits: normalize entity (title, registrable domain) + fingerprint overlap + content hash.
- Events get `sources[]`. Mail and feed use events, not raw hits.
- Mute writes `ignore[]` and suppresses the cluster next run.
- Claim change = explicit “rebuild watch” → new fingerprints, new baseline, warn about credits.

**Exit**

- [x] Fixture: same title on Search + Watch + HN adjunct → one event, three sources
- [x] Mute survives the next Tingle tick
- [x] Editing the claim without confirm does not change the job

---

## Phase 7 — Proof, CI, demo pack

**Goal:** A stranger can clone, reproduce, and you can record the brief.

**Do**

- README: Tingle setup, mock vs live, collector create commands, heal steps, public-data statement. `prove:tingle-live` is local-only; commit chaos heal + schema example.
- Pin all `c_*` in `.cursor/rules` and `.env.example` placeholders.
- Demo script matching [hackathon-fit.md](hackathon-fit.md) “Demo shape.” Mask keys on screen.
- Submission notes: how Studio was used (Search + Watch + Chaos, trigger, heal).
- **Then** (optional, idea 5): GitHub Actions cron — chaos run → Zod → heal → re-run. `--auto-approve` behind a flag. Token only as an Actions secret. Needs a remote; do not add this in Phase 1.

**Exit**

- [x] `prove:tingle-live` and `prove:tingle-heal` documented and passing in live mode at least once (heal artifact committed; live collect dumps stay gitignored)
- [x] Judge could follow README without Slack ([docs/tingle/demo.md](demo.md), [docs/tingle/submission.md](submission.md); Tingle.git README)
- [x] Demo includes heal with **unchanged** Tingle UI code

---

## Phase 8 — After the qualifying product

Shipped as opt-in product, **not** as Scrape-Verse eligibility:

- [x] **Keep this on my GitHub** — `.tingle/` tree, repo scope asked at toggle (PAT or OAuth `repo`). Vault remains default. Spec: [format.md](format.md).
- [x] Google/GitHub **login** polish (env-gated OAuth apps; email+password still default; login scope ≠ repo)
- [x] Extra Studio Discovery URLs via the pinned Watch collector (long-tail only; never a new `c_*`)
- [x] ChatGPT / Google AI Mode **datasets** as labeled best-effort on the **deep** lane, not in `collectors_returned`
- [x] Deep Lookup / Firehose: honest skip unless dataset ids are set; never invented
- [x] Public `.tingle/` format note ([format.md](format.md))
- [ ] Rename off Tingle for a US storefront — **lawyer + you** ([name.md](name.md))

Live ChatGPT / Google AI Mode now call `/datasets/v3/scrape` on the **deep** lane and keep **citations only** (never the model’s answer as a competitor). Firehose stays an honest skip — it is a Bright Data sales stream, not a dataset we can trigger. GitHub/Google **login** is wired; buttons appear once `GITHUB_OAUTH_*` / `GOOGLE_OAUTH_*` are in `.env`. Mock and `prove:tingle-phase8` cover the code path without spending credits.

Reopening “marketplace scrapers as core” is an explicit product decision. It **breaks** Scrape-Verse fit.

---

## Suggested implementation map

```
packages/shared          ← keep Changelog Radar; optionally extract generic BrightDataClient
packages/tingle-core
  schema/hits.ts         HitRow Zod
  schema/profile.ts
  schema/events.ts
  bd/client.ts           trigger, poll, heal, approve (copy/adapt shared)
  bd/validate.ts         Zod gate + heal prompt from issues
  claim.ts               rewrite + fingerprints
  piles.ts               first look mapping
  dedup.ts
  budget.ts
  vault.ts
  jobs/firstLook.ts
  jobs/tingleTick.ts
apps/tingle or web-ui/src/app/tingle
  login, home, quick-chat, new-project, project (piles, analyst, feed, switch)
mcp-server or tingle-api
  HTTP + optional MCP tools: first_look, tingle_tick, heal_status
  (agent still uses bdata CLI to create collectors)
fixtures/tingle-chaos/
docs/proof/tingle/
.cursor/rules            pin TINGLE_C_* 
```

Tingle HTTP **runs** collectors. Humans/agents **create** collectors with `bdata scraper create`.

---

## Phase dependency graph

```
0 hygiene
  → 1 extractor + heal          ← eligibility lives or dies here
      → 2 first-look JSON
          → 3 UI shell
              → 4 tingle tick + mail
                  → 5 vault
                  → 6 dedup/mute/lock   (can overlap 4–5)
                      → 7 demo/proof
                          → 8 later
```

Do not build 3 before 1 has a real `c_*`. Do not build 8 into 1.

---

## Definition of done (product + brief)

A user can sign in with email, paste a pitch, confirm a claim, get three piles from **Studio Search/Watch JSON**, turn Tingle on, receive an email when a **Now** event appears, and a recorded demo shows `heal` on chaos with the **same** collector id and no app code change. Budget can pause the watch. Dedup collapses multi-source hits. No pre-built GitHub/Reddit scraper is the hero. No secrets in git.

That is the kickoff target. Spec details remain in the other files in this folder; if this file and those files disagree, **hackathon-fit.md** and **decisions.md** win.
