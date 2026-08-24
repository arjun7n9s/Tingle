# Tingle architecture (locked)

This is the product. A three-collector hackathon slice is the proof path, not the watch.

If a new pitch is narrated differently tomorrow, nothing here cares about robots vs vests vs lures. The claim is compiled into fingerprints. Geo selects **owned** collectors. Zod trips on empty extractors. Piles and urgency stay deterministic. AIMLAPI does not chat about the landscape.

```
user input → claim + fingerprints + geo/jurisdiction
                         │
  ┌──────────────────────┼──────────────────────────────────┐
  │              OWNED COLLECTORS                           │
  │  search   watch   chaos                                 │
  │  + patent (Google Patents Search — one c_*, all offices │
  │    Google indexed: US / EP / WO / JP / CN / …)          │
  │  + regional Discovery boards (later; region_us = Watch) │
  └──────────────────────┬──────────────────────────────────┘
                         │
        adjuncts (never the only path, always labeled)
        · USPTO Open Data Portal JSON
        · later: SERP Yandex / Baidu / Naver
        · Web Unlocker listing when Studio cannot open patents.google.com
        · Web Unlocker markdown for patent detail URLs (capped 2/4)
                         ▼
               AIMLAPI NORMALIZER (single call site)
               · foreign-lang → English title
               · patent abstract → 1-line problem statement
               · snippet-less card → inferred snippet from present text
               · audit_id logged per call
               · empty title AND snippet → no LLM; Zod incident → heal
                         ▼
               SCHEMA GATE (the tripwire)
               empty required = incident → bdata scraper heal
                         ▼
               PILES (pure, no LLM)
               stand_on_this | local_lane | fast_tracker
               shipped_last_7_days | patent_landscape
                         ▼
               DIFF + URGENCY (classify.ts, deterministic)
               added / changed / muted vs baseline
               urgency: now | soon | digest
                         ▼
               ALERT (email, Slack, Discord, webhook)
               now → immediate; else → digest floor
```

## What is locked (2026-08-24 re-lock)

### Patent lane = one Google Patents collector

Bright Data has **no patent dataset and no pre-built USPTO/EPO scraper**. The patent product is therefore a **Studio Search collector** on `patents.google.com`, pinned once as `TINGLE_C_PATENT`.

That one listing already returns US / EP / WO / national filings Google indexed, plus cited prior art on the result cards. Per-office collectors (JPO, KIPO, CNIPA, …) are **later**, when a paying user needs an office Google does not cover — not a day-0 menu.

Studio's crawler currently refuses `patents.google.com` (`Navigation failed … this endpoint is not supported`). Keep the existing `TINGLE_C_PATENT` pin. Do **not** mint a second Patents collector. First look and ticks still trigger the collector; if it returns no patent cards, Web Unlocker (`cli_unlocker`) fills listing cards from the public search URL. The Studio miss stays in `collectors_failed`. Unlocker is labeled in `sources_used`. Titles come from the page, not the model.

USPTO Open Data Portal JSON (`USPTO_ODP_API_KEY`) stays an **adjunct**. Structured US fields. Never the only path. Never the proof path.

Do **not** create `TINGLE_C_PATENT` if it is already pinned. Do **not** run `bdata scraper create` in an agent session unless the human says to create it.

### Owned collectors, pinned once

| Lane | Studio type | Pin | Notes |
|---|---|---|---|
| Search | Discovery | `TINGLE_C_SEARCH` | Fixed listing. Never `{q}`. Rank after scrape. |
| Watch | Discovery | `TINGLE_C_WATCH` | Default **US/EN** board (Uneed). Extra pasted URLs reuse this `c_*` with `{url}`. |
| Chaos | Discovery | `TINGLE_C_CHAOS` | Heal demo only. Not a production tick. |
| Patent | **Search** | `TINGLE_C_PATENT` | Google Patents result cards. Query compiled from the claim, stuffed into `patents.google.com/?q=`. |
| Region × n | Discovery | `TINGLE_C_REGION_JP` … | Later. `region_us` **aliases Watch**. |

Create costs 5–25 minutes. If the env pin is set, **never create again**. Heal in place. Same `c_*`.

Unpinned patent is a **collector failure**, not an empty niche. A JP user with no `TINGLE_C_PATENT` must see `patent not pinned`, not “no Japanese prior art.”

### Geo routing (now)

`profile.geo.country` (ISO 3166-1 alpha-2) selects:

- **Cheap:** Search + home regional board + Google Patents.
- **Deep:** cheap + up to two other regional boards + extra Watch `{url}`s + USPTO JSON adjunct.

Watch (Uneed) is the US home board. For a JP user it is a **foreign** board → `fast_tracker`, not `local_lane`. Google Patents is **not** geo-split; it already mixes jurisdictions. Home-office Studio collectors are later.

### AIMLAPI — one seam

The analyst stays a deterministic assembler. Optional chat narration of **existing JSON** is not the product spend.

AIMLAPI runs **once**, in `normalize.ts`, **after** alias fold, **before** Zod:

- Translate a present foreign title.
- Compress a present abstract/claims blob into a one-line problem statement (snippet).
- Infer snippet from present title-adjacent text.

It does **not** invent a title from a blank extractor. Blank title + blank snippet = Zod incident = heal.

Every call logs `audit_id`, collector key, and char counts.

Bright Data MCP `extract` is a later cheap alternative for listing→JSON. It does not replace AIMLAPI on patent abstracts.

### Piles (no LLM)

| Pile | Meaning |
|---|---|
| `stand_on_this` | Papers, libraries, docs — prior work to reuse. |
| `local_lane` | Products from the user's home region. |
| `fast_tracker` | Products shipping in another region. |
| `shipped_last_7_days` | Home-region launches with `published_at` in the last week. |
| `patent_landscape` | Rows from the Google Patents collector (or patent-office hosts). |

`already_in_the_lane` remains as an alias of `local_lane` so older clients do not crash.

### Scheduler

`tingleTick` is the unit of work. The API process ticks watching projects on `TINGLE_TICK_MS` (default 15 min). Azure (or any cron) should also `POST /internal/tick` so a process restart is not the only clock.

Unattended ticks **never** auto-approve heals unless `TINGLE_HEAL_AUTO_APPROVE=1` (CI only).

### Later (not now)

Unlocker listing fallback (when Studio returns no patent cards) and Unlocker markdown for patent **detail** URLs (capped: 2 cheap / 4 deep) are wired. Still later:

- SERP Yandex / Baidu / Naver as labeled adjuncts for “shipping in another region.”
- Browser API fallback for J-PlatPat / KIPRIS / Espacenet session walls.
- Dataset streaming to S3 (poll-until-done stays until then).
- Per-jurisdiction Studio collectors.
- Granted vs filed sub-piles.

### Explicitly not this product

- USPTO JSON / PatentsView as the patent lane (adjunct only, labeled).
- One Watch URL as “the world’s launches.”
- Eight office collectors as the day-0 patent product.
- Dataset Marketplace “Google Patents dataset” as the proof path.
- AIMLAPI in the analyst inventing products.
- Creating a new `c_*` because the old one drifted.
- Auto-approving heals on unattended ticks.

## Proof vs production

Scrape-Verse eligibility still needs the three long-tail Studio collectors (Search / Watch / Chaos) plus a live heal. Google Patents is the **production patent watch**. Same Studio mechanism, same frozen HitRow fields, same heal loop. It is an additional pin, not a fourth collector for a pasted URL.
