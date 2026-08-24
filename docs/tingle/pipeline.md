# Tingle — pipeline

Same scrape fan-out for first look and Tingle. Different filter: first look is the ground; Tingle is the **diff**.

```
drop (toggles)
  → extract artifacts
  → stage (user pick)
  → confirm claim
  → watch profile
  → first look → baseline
  → [if Tingle on] scheduler → classify → dedup → urgency → email + feed
```

If Tingle reprints the first-look landscape every cycle, people unsubscribe. Diff or don’t send.

---

## Watch profile

This object is the product. Storage: encrypted vault (default) or `.tingle/profile.yml` (opt-in).

```
project_id
stage                  starting | building | shipped
claim                  one confirmed sentence
fingerprints[]         phrases, names, claim fragments, repo topics
must_match[]           if this shows up, it is the same niche
ignore[]               adjacent stuff that is not them
sources[]              which collectors / lanes to run
baseline_ids[]         first-look hits so week 2 is a diff
geo                    country + language for SERP and AI-answer scrapers
budget                 hard cap + spent + lane (cheap | deep)
alert_email
digest_floor           daily | weekly
urgency_prefs          now always; soon same-day | digest; note digest-only
stealth                bool
storage                vault | github
```

Fingerprints get sharper over time. Starting = loose. Building = feature names from the README. Shipped = brand + “alternative to X.”

---

## Artifact extractors

Treat inputs as typed. Do not “upload a file” as an untyped blob.

| They give | Extract | Do not extract |
|---|---|---|
| Vague paragraph | claim, entities, must-have vs nice | TAM |
| Patent / spec PDF | title, abstract, independent claims in plain English, inventors, filing date | legal novelty or FTO |
| GitHub | README promise, languages, deps, last commit, topics | “this will succeed” |
| Product URL / PH / docs | what it says it does, public pricing, changelog | fake competitors from model memory |
| Patent number | same as PDF, via public record | infringement opinion |

A project can have several artifacts. The watch profile is the merge.

---

## Stage × inputs → scrape plan

Do not scrape “the internet.” Build a **job** from what they handed you.

### Always (every stage) — Studio is the proof path

Scrape-Verse (and Tingle as submitted there) **qualifies only if** Bright Data Scraper Studio is the core. Pre-built 800+ site scrapers are a DQ if a judge would ask why we didn’t use them. Full lock: [hackathon-fit.md](hackathon-fit.md).

**Qualifying lanes (own `c_*`, heal these):**

| Lane | Studio type | Input |
|---|---|---|
| Claim search | **Search** | fingerprints as keyword + optional country (Quick chat / pitch-only) |
| Watch pages | **Sitemap** or **Discovery** (+ PDP if needed) | changelogs, docs, niche boards, regional catalogs, competitor URLs they pasted |

Create with `bdata scraper create`. Run with `bdata scraper run` and `POST /dca/trigger`. Pin `c_*` in agent rules. Same id after heal.

Cache keys for Search include **country** (plus language/device if set). Public HTML only. No login walls.

**Adjunct, never the only path:** public JSON APIs (USPTO, arXiv, HN Algolia, GitHub REST for a repo they pasted). Direct — not Unlocker markdown, not a Bright Data GitHub/Reddit dataset. If Studio returns empty required fields, that is a **heal incident**, not “fall back to ChatGPT.”

How those adjuncts sit next to Studio Search/Watch, SERP-then-Watch `{url}`, claim compile, and the relevance judge: [architecture.md](architecture.md).

**Not on the qualifying path:** Dataset Marketplace / 800+ scrapers (GitHub, Reddit, LinkedIn, Amazon, PH-if-prebuilt, ChatGPT/Google AI Mode datasets). Product-later optional. Not how we satisfy the brief.

If a toggle is off, that lane does not run. Empty GitHub toggle = do not invent a repo. GitHub as *data* is their URL plus REST/README, not Bright Data’s GitHub scraper.

### Starting

- **Pitch only:** papers, similar products, “this library already is that.” Tingle later: new launches and filings in that sentence.
- **Docs / patent:** patents and papers first. PDF claims become fingerprints, not the fluffy abstract.
- **Danger as Now:** someone *shipped* the sentence. A paper is usually Soon.

### In progress

- **GitHub:** README + deps are source of truth. First look must say “you already depend on X” or “you are rewriting X.” Watch feature names from the repo, not the original vague pitch.
- **Pitch + GitHub:** pitch is intent, repo is reality. Show disagreement; ask which to watch.
- **Danger as Now:** near-clone of the repo, or a rival shipping the feature they are mid-build on.

### Done (shipped)

- **URL:** their live copy is the brand. Rivals, changelogs, AI answers that omit them. Patents if they also filed.
- **Patent:** new filings in the lane, and products that look like the claims. Analyst says “this published application uses the same verbs,” **not** “you infringe.”
- **Danger as Now:** AI-answer displacement, knockoff, filing in the claims.

Vice versa: starting is mostly Banner + a little spider-sense. Shipped is mostly spider-sense + a little Banner. Building is both.

---

## Collectors and heal

This *is* the product’s reliability story, not a footnote.

Pin `c_*` per target shape in `.cursor/rules` / `AGENTS.md`. When required fields come back empty, that is an extractor incident, not “the web had nothing” and not “the niche is empty.”

```
create → run → Zod/schema gate → heal (same c_*) → approve or reject → run again
Tingle jobs: POST /dca/trigger on that c_*  (CLI run is the proof; trigger is production)
```

1. Schema-validate rows. Never store invalid rows as success.
2. On fail → `bdata scraper heal` with issue-derived prompt, keep field names.
3. Preview + `approve`. `--reject` and a sharper prompt if the preview is wrong. `--auto-approve` only behind a flag for unattended Tingle.
4. Analyst: “this collector did not return” — then heal. Do not fill the hole with a model.

Bright Data dashboard is not the workflow. Agent terminal is.

See [hackathon-fit.md](hackathon-fit.md) and [self-healing scrapers](../self-healing-scrapers.md).

---

## Events

Do not dump fifty links. Classify, then pick what to show.

| Type | Meaning |
|---|---|
| Already exists | stand on it (first look, or a new library that appeared) |
| Someone else is building | same niche, not shipped |
| Just shipped | PH, GitHub release, domain went live |
| Paper / patent moved | new filing or preprint in the claim |
| AI default shifted | ChatGPT / Google AI Mode (when the lane works) now cites them or a rival |
| Discussion spike | Reddit / HN / X using fingerprints |

**Danger** is not “a lawyer said you infringe.” It is “this public thing showed up in your lane.”

### Urgency index

Stored on the event.

| Level | Examples | How they hear it |
|---|---|---|
| **Now** | Exact claim launched. New patent/application matching fingerprints. AI Mode in their geo names a rival as default (if lane worked). Near-copy of their repo. | Email immediately. In-app if they are on the project. |
| **Soon** | Adjacent launch. Preprint. Serious HN/Reddit thread. Competitor changelog shipping *their* next feature. | Email same day, batched if several. |
| **Note** | Weak keyword hits, academic-adjacent, “someone mentioned the problem.” | Digest only. |
| **Quiet** | Nothing new over the fingerprints. | Digest can say “nothing close.” That is a real Tingle. |

Stage shifts what counts as Now (see above).

---

## Dedup (claim-level, ship-blocker)

Same paper on arXiv + HN + Twitter = **one event**, not three.

- **URL / content hash** — tells you a *page* moved. Needed for baseline diffs. Not enough to count threats.
- **Claim-level collapse** — two hits with the same fingerprint cluster + same entity + similar content hash become **one event** with `sources[]`.

Witness-style hash-on-(url, observer, content) does **not** dedupe across sources. Do this in the data plane before Tingle mail goes out.

**Mute** adds the entity/URL to `ignore[]` so it cannot reopen as three events next week.

---

## Budget (hard cap, visible, anti-bankruptcy)

Every project has a spend ceiling (credits). First look burns a chunk. Tingle burns the rest.

- Hit the cap → Tingle **pauses**. Project page: *This project’s Tingle is paused because it exceeded its budget — adjust here.*
- Cheap = fewer Search/Sitemap runs, adjunct APIs. Deep = more Discovery+PDP pages on **long-tail** URLs (still Studio, still not marketplace scrapers).
- Do not hardcode unit prices in the product. Hackathon pricing is published as **$1.50 / 1,000 page loads**; measure our jobs, then set plan defaults.

Without a cap, first look + daily Tingle at indie prices will eat the company.

---

## First look vs Tingle (same tools)

| | First look | Tingle |
|---|---|---|
| When | once (and on claim-lock rebuild) | while switch is on and budget remains |
| Output | three piles | deltas vs baseline, classified + urgencied |
| Third pile | last 7 days by source timestamps | n/a — use event time vs baseline |
| Baseline | written after success | read + updated after each run |

---

## Bright Data primitives we actually use

Load-bearing for **fit**:

- **Scraper Studio** — `create` / `run` / `heal` / `approve`. Search, Sitemap, Discovery, PDP. We own the extractor.
- **`c_*` as API** — `POST /dca/trigger` from Tingle jobs. No extra deploy.
- **CLI inside the coding agent** — `npx -p @brightdata/cli`. Dashboard only to confirm the id or a schedule.
- Studio still sits on proxies, fingerprints, rendering, CAPTCHA, retries (their infra, our schema).

Allowed **around** Studio, not instead of it:

- Geo on **Search** (country on the collector). Cache key includes country / language / device when used.
- Direct JSON gov/package APIs when they exist (do not Unlocker them).
- MCP / CLI / skills to drive heal — the Tingle UI consumes JSON, it does not author selectors.

**Not qualifying:** 800+ pre-built scrapers, Dataset Marketplace, Firehose, ChatGPT/Google AI Mode **datasets** as the core watch. After Scrape-Verse, those can be an opt-in deep lane. They cannot be how we prove Studio.
