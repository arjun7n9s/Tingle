# Demo recording script

Matches the presentation criterion in the Scrape-Verse brief. Five beats, in
this order. If beat 4 is missing, the demo does not fit the brief.

**Mask keys on screen.** `.env`, the Bright Data token, vault master, and any
`Authorization` header stay off camera. Collector ids (`c_*`) are fine to show
— they are not secrets. Prefer a throwaway token if a request pane must appear.

Terminal is the scraper UI. The Tingle app consumes JSON; it never authors
selectors. Do not open the Bright Data dashboard except as a one-second glance
at a `c_*` if a judge asks.

Do **not** run `bdata scraper create` in the recording if the three ids are
already pinned. Create burns 5-25 minutes and a new id orphans the demo.

---

## 1. Confirm the claim

Open Tingle (`npm run api` → http://127.0.0.1:8788). New project. Type a pitch,
accept the one-sentence rewrite.

Say out loud: *one sentence, then we spend credits.*

## 2. Collectors already owned — run, don't create

In the terminal, show the pinned ids (from `.env`, token lines scrolled off):

```text
TINGLE_C_SEARCH=c_mt3k9kgdv5dj23xxd   # Discovery, https://dev.to/t/indiehackers
TINGLE_C_WATCH=c_mt3jjp0qjjjt1thr3    # Discovery, https://www.uneed.best/
TINGLE_C_CHAOS=c_mt3jbbz21pal4p4vgp   # Discovery, chaos fixture
```

If a judge needs to see **create** as a workflow (not this session's spend):

> We created each collector once with `bdata scraper create`, type named in the
> prompt. After that, production is `POST /dca/trigger` against the same id.
> Full prompts: `docs/collectors.md`.

Then run, not create:

```bash
npx -p @brightdata/cli bdata scraper run "$TINGLE_C_WATCH" "https://www.uneed.best/" --pretty
```

Show a handful of JSON rows: `title`, `url`, `snippet`, `published_at`,
`source_domain`. Those field names are frozen.

## 3. First look — three piles from that JSON

Back in the app: run first look on the confirmed claim. Point at the three
piles. Open the sources footer. Say which lanes ran (Search, Watch) and which
adjuncts are labeled as not-Studio (HN, and USPTO only if a key is set).

If a pile is empty, say the collector returned nothing — do not invent products.

## 4. Break → heal → same `c_*` → piles still render

This is the eligibility beat. Stay on the **same** Tingle UI. No code change.

Stage the break (chaos fixture redesign URL, already in config as
`TINGLE_CHAOS_BROKEN_URL`) and heal:

```bash
npm run prove:tingle-heal
# stops at preview unless you pass --auto-approve
```

On camera: validation fails (empty dataset or empty required fields) → heal
preview → approve → retry. Read `collector_id_before` and `collector_id_after`
from the artifact — they match. Refresh the project page. Piles still render.
Application code was not edited.

If time is tight, open the committed proof instead of waiting on a live heal:

[`docs/proof/tingle/heal/heal-2026-08-22T11-05-53-999Z.json`](proof/tingle/heal/heal-2026-08-22T11-05-53-999Z.json)

Same story: `same_collector_id: true`, `retry_succeeded`.

## 5. Tingle on — one event, not a reprint

Flip the Tingle switch. Require `alert_email`. Trigger a second run (`tick`)
with something new in the lane (mock: `inject_new_watch`). One event in the
feed; Now mail lands under `.data/tingle/mail/` in mock. Mute a cluster if
there is time — it stays muted on the next tick.

---

## Out of the recording

- Bright Data's 800+ library and Dataset Marketplace
- Recreating Search / Watch / Chaos
- A viability score or TAM slide
- The vault master, API token, or a live Search/Watch dump committed to git
