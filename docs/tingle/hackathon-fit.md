# Tingle vs Into the Scrape-Verse

Official rules: [Into the Scrape-Verse](https://www.wemakedevs.org/hackathons/scrape-verse) and the [kickoff guide](https://www.wemakedevs.org/blogs/scrape-verse-kick-off).

Tingle is the **something real**. Scraper Studio is the **core**. If a judge can ask “why didn’t you just use a pre-built scraper?”, we failed qualification — not style.

This file is the requirements lock. Product screens stay in [product.md](product.md). Jobs stay in [pipeline.md](pipeline.md).

---

## Must (eligibility)

Quoted from “What you’re expected to do” and Best practices. The long-tail rule is called out as deciding **whether a project qualifies at all**.

| Requirement | Tingle does this |
|---|---|
| **Scraper Studio is mandatory** | Every watch job’s *proof path* is a Studio collector (`c_*`). Not Unlocker-as-the-product. Not datasets v3 as the product. |
| **At least one real `create` + `run`** | Agent runs `bdata scraper create` then `bdata scraper run`. The `c_*` is pinned and committed to agent rules, not rebuilt every session. |
| **`c_*` is the proof** | First look and Tingle **trigger** that collector (`bdata scraper run` and `POST /dca/trigger`). Downstream never hardcodes a second scraper for the same target. |
| **Self-healing shown** | Schema/Zod fail or empty required fields → `bdata scraper heal` → preview → `approve` (or reject + sharper prompt) → **same `c_*`**. Tingle / first look keep working with no code change. Automate the loop; demo it. |
| **Wire `c_*` into something real** | Trigger from the Tingle job (schedule / “run first look” / urgency tick), persist JSON, feed the analyst and the event log. Collector is a live API, not a screenshot of the Bright Data dashboard. |
| **Long tail only (qualifying scrapes)** | Studio targets are sites **not** in Bright Data’s 800+ pre-built library: changelogs, docs, niche boards, regional catalogs, B2B listings, the user’s own competitor URLs. Judge test: “why not the GitHub/Reddit/Amazon scraper?” → we didn’t use those. |
| **Public pages only** | No login walls, paywalls, or personal data. User-uploaded pitch/PDF is *their* file, not a scrape. Stealth = don’t leak the pitch; still only hit public HTML. |
| **No secrets in repo or demo** | `.env` gitignored. Tokens masked in recordings. Throwaway key if a demo must show a request. |
| **Repo a judge can clone** | Setup: `npx -p @brightdata/cli`, `bdata login`, pin `c_*`, how to run first look and heal. |
| **Agent / terminal is the scraper UI** | Create, run, heal, approve from Cursor (or Claude Code / Codex). Bright Data **dashboard** only to glance at `c_*` or set a platform schedule. Tingle’s website is **downstream of JSON**, not how we author scrapers. |
| **Own the scraper code** | Studio-generated extractor is ours. Heal rewrites it in place. We do not treat a maintained marketplace scraper as “our” heal story. |
| **Pin Collector ID in agent rules** | `.cursor/rules` / `AGENTS.md`: reuse `c_*`, never `create` again for the same target. |

Submit form also wants: repository, demo video, project description, **how Scraper Studio was used**. Demo must cover: problem → scraper workflow → structured output → Tingle (piles + feed).

AI coding tools are allowed. We must be able to explain create / run / heal / trigger.

---

## Mapped to their idea list

Tingle is not idea 1. It is **4 (required hero) + 7 + 8**, with **2/5** as how it stays alive.

| Their idea | Role in Tingle |
|---|---|
| **4 Self-healing (hero)** | Empty/invalid rows start heal. Same `c_*`. Bonus: unattended loop with approval gate. |
| **7 Competitive intel** | Sitemap (or Discovery) on changelog / release / launch pages. Diff vs baseline. Mail + feed. |
| **8 Keyword agent** | Studio **Search** type: claim fingerprints + optional country. No URL required for Quick chat / pitch-only first look. |
| **2 Pipeline** | `POST /dca/trigger` → store JSON → analyst / baseline. |
| **5 CI heal** | Cron or Actions: run → validate → heal → re-run. Green check = extractor recovered. |

Do not lead with 6 (docs RAG) or 9 (worktree battle). Those are someone else’s demo.

---

## Scraper types we actually use

Say the type in the `create` prompt.

| Type | When |
|---|---|
| **Search** | Quick chat and pitch-only first look. Keyword + country. Cache key includes country (and language/device if we set them). |
| **Sitemap** | Docs, blogs, changelogs, launch indexes the watch should cover. |
| **Discovery** | A listing URL (niche board, regional catalog) → items. |
| **Discovery + PDP** | Listing plus detail pages when the claim needs more than a card. |
| **PDP** | One important public URL (a competitor product page, a filing HTML page that is **not** already a Bright Data dataset). |

---

## What is allowed vs what would DQ us

**Qualifying (Studio):** Search / Sitemap / Discovery / PDP collectors we `create`. Heal those. Trigger those.

**Adjunct, not the proof:** Public **JSON APIs** we already said not to Unlocker (USPTO, arXiv, HN Algolia, GitHub REST for a README they pasted). These are not “pre-built scrapers.” They also must not be the only data path. If Studio is down, Tingle should say the collector didn’t return — not silently become an API mashup.

**Out of the qualifying path:** Bright Data 800+ site scrapers and Dataset Marketplace as the hero (GitHub, Reddit, LinkedIn, Amazon, Product Hunt if it has a maintained scraper, ChatGPT/Google AI Mode **datasets**). Those fail the long-tail test. Optional later product, **not** how we satisfy Scrape-Verse.

**Chaos / break demo:** Keep a fixture page or a real long-tail target whose fields we can null. Heal against that. Do not fake JSON in the analyst.

---

## Heal loop (this is the brief)

```
bdata scraper create <URL> "<schema in plain language>"   → c_*
bdata scraper run <c_*> <URL>
validate rows (Zod) — empty required field = incident, not “nothing in the lane”
bdata scraper heal <c_*> "<what broke; keep field names>"
bdata scraper approve <c_*>          # or --reject and heal again
bdata scraper run <c_*> <URL>        # same c_*; Tingle code unchanged
```

Production Tingle jobs use `POST /dca/trigger` (and poll) against the same `c_*`. CLI is how we prove it; API is how it runs.

Default heal: await approval + preview. Unattended Tingle: `--auto-approve` only behind a flag, still log the preview.

---

## Six judging criteria (equal weight)

How Tingle answers each, so we don’t build a pretty app with a footnote heal:

| Criterion | Answer |
|---|---|
| **Potential impact** | Builder is mid-build; the web moves; empty scrape looks like an empty niche. Tingle keeps the watch honest. |
| **Creativity** | Watch on *their* claim, not another changelog dashboard. Search (no URL) + Sitemap watch + heal so “nothing found” isn’t a dead extractor. |
| **Technical excellence** | Schema tripwire, claim-level dedup, budget cap, vault, staged inputs. |
| **Use of Scraper Studio** | Central. `create` / `run` / `heal` / `approve` / `trigger`. Pinned `c_*`. |
| **Reliability and self-healing** | Empty fields → heal in place. Downstream still holds `c_*`. |
| **Presentation** | Demo: problem, CLI workflow, JSON, then Tingle piles + a heal that doesn’t change the app. |

Tracks (every submission is considered automatically): Web-Slinger = this Studio usage; Suit-Up = Tingle UI; Spider-Sense = readable heal + validate + trigger code.

---

## Demo shape (presentation criterion)

1. Confirm claim (one sentence).
2. Agent: `create` + `run` on a **long-tail** URL or Search keyword. Show JSON.
3. First look: three piles from **that** JSON (plus adjunct APIs clearly labeled).
4. Break or catch nulls → `heal` → `approve` → `run` again. Same `c_*`. Piles still render.
5. Tingle on: second run diffs baseline; one event in the feed / email.

If step 4 is missing, we did not fit the brief.
