# Tingle — product surface

Landing copy can wait. After signup, this is the product.

**Scraper workflow is not this UI.** Create / run / heal / approve happen in the coding agent (`bdata …`). This app is what structured JSON *becomes* (first look, analyst, Tingle feed). Bright Data’s dashboard is only a glance at `c_*`. If we author scrapers by clicking around Studio, we miss the brief. See [hackathon-fit.md](hackathon-fit.md).

## Sign in

Identity and data source are **not** the same button.

**Identity (pick what they have):**

- Email + password (lowest friction — default path)
- Google
- GitHub (login only)

**Not at signup:** repo OAuth, “give us access to your GitHub.” That is a later, explicit ask if they turn on the GitHub input toggle or **Keep this on my GitHub**.

## After they exist

One account. Home has two doors plus a list.

```
[You]
  Quick chat      ← one-shot scrape, no watch, no memory
  New project     ← first look + optional Tingle
  Projects        ← watches they already made
```

Profile (separate): login methods, vault vs GitHub storage, default digest floor, stealth default, email for alerts.

---

## Privacy and where data lives

### Default: encrypted vault (we hold the ciphertext)

Most buyers (indie hackers, stealth, pre-PMF) do not have a public GitHub for this idea. They have Notion, Docs, local markdown, or nothing. The default is **fast**.

Pitch and artifacts sit in a **per-user encrypted vault**. They are not a row in a searchable “ideas” table.

We still **see** the claim while a job runs. We do not promise “we never see it.” We promise we do not keep a plaintext pitch around as a product dataset.

What must exist on our side even with a vault:

- account id
- email for Tingle
- OAuth tokens if they connected Google/GitHub for login
- Bright Data collector ids (`c_*`) — those are ours
- spend / budget counters
- enough to send mail (pointer to project, not a copy of the patent)

### Opt-in: Keep this on my GitHub

Power-user / paranoid path. Toggle copy along the lines of: *Your pitch never sits in our database.* Precise meaning: the watch profile and artifacts live in **their private repo**; we read/write via OAuth; revoke access and we are left with email, `c_*`s, and budget — not the filing.

Suggested tree:

```
.tingle/
  profile.yml       # stage, claim, fingerprints, sources, alert prefs
  artifacts/        # uploads or pointers
  baseline.json     # first-look hits: urls + hashes, not our commentary
  events/           # append-only: what moved, when, urgency
```

Same file shape as the vault. Storage backend is the only difference.

Stealth project: still search the **public** web for collisions. Do not write the pitch into a public gist. Do not put the claim in a prompt that might leak.

---

## Quick chat

Throwaway analyst thread. Paste a sentence, get a grounded answer, leave.

- No project memory
- No Tingle
- No email

If the answer bites: **Turn this into a project** at the bottom. Carries the claim into New Project. Stage is still unasked — ask it then. Do not assume Starting.

Chrome matches HomeStar’s analyst: user on the right, **ANALYST** on the left, follow-up box at the bottom.

---

## New project

One screen. Not a seven-page wizard.

### 1. Where are you? (one pick)

| Choice | Product meaning |
|---|---|
| Starting off | No public build yet. First look is “stand on this.” Tingle is occupancy. |
| In progress | Repo or WIP. First look is “you are rewriting X.” Tingle is clones + someone shipping your next feature. |
| Done with the build | Live thing or filed patent. First look is landscape vs you. Tingle is defensive. |

They can change this later.

### 2. One extra question per stage (choosable)

- **Starting:** Who can know? `Stealth (private)` / `Fine if this is public`
- **In progress:** What should we trust most? `The repo` / `The docs` / `What I type`
- **Done:** What are we protecting? `The product` / `The filing` / `Both`

If they dump a repo **and** a fuzzy pitch, trust the repo unless they picked “What I type.” If pitch and repo disagree, **show both** and ask which to watch. Do not average them.

### 3. Input modes (toggles, combinable)

Minimum: **one** toggle on, with something in it. Pitch-only is valid.

| Toggle | They give | Treated as |
|---|---|---|
| **Pitch** | text | the claim, in their words |
| **Docs** | PDF / md / spec / patent | claims, abstract, constraints |
| **Link** | one or more URLs | product, PH, paper, known competitor |
| **GitHub** | pasted repo URL, or connected repo | README promise, deps, recency |
| **Watch list** | extra sites or names | known rivals, a subreddit, a conference |
| **Patent number** | existing filing id | do not force a PDF |
| **Ignore** | “looks like us, is not” | stops Wikipedia / false twins |

GitHub as **data** is this toggle (URL paste is enough). GitHub as **login** already happened or didn’t. Connecting repos is a separate OAuth prompt here, not at signup.

### 4. Confirm the claim

Rewrite their mess into **one sentence**. They edit it. That sentence **is** the watch. Show it before spending Bright Data money.

**Claim lock:** after confirm, changing the sentence is a deliberate edit. It rebuilds fingerprints. Accidental edits must not retarget the watch.

Then: **Run first look.** Not “validate my idea.”

---

## First look (the response)

Same analyst chrome. Job, stated once:

> I only report what the scrapers returned for this project. I do not invent products, papers, or patents. If a source did not come back, I will say it did not come back.

Always three piles (empty is allowed if the label is honest):

1. **Stand on this** — existing work to use, not rebuild. Each row: title, url, why it matches the claim, which tool fetched it.
2. **Already in the lane** — live products / repos / filings that are the same job.
3. **Shipped in the last 7 days** — PH launch date, GitHub `created_at`, patent publication date, arXiv submitted. **Not a diff.** There is no baseline yet. Do not call this “moved recently.”

No viability score. No TAM.

**Sources used this turn** is a **collapsible footer** on the answer, not a chat reply.

Follow-ups are tool-gated (“show the GitHub ones,” “what did Google AI Mode cite in IN vs US”). If there is no collector for the question, say that.

**Mute this URL** on a false hit writes `ignore[]`. Otherwise Tingle cries wolf.

Quality (instrument, then use as a regression kill-switch once there is a sample):

- relevance of each hit
- did piles cover what they actually handed us
- convert Quick chat → project
- did they come back

Dogfood until a first look is not one Wikipedia link and three dead PH posts. Do not block engineering on a fake “median ≥5” with zero users.

---

## Project page

- The three piles from the first look
- **Project analyst** (has memory of claim, sources, history)
- **Tingle switch** — off until they turn it on; turning on asks for **email** (pre-filled from account, editable)
- **Urgency feed** — events, not chat
- **Budget bar** — spend vs hard cap; pause copy when hit (see [pipeline.md](pipeline.md))

Tingle off = saved first look + chat. That is valid.

### Two conversation surfaces only

| Surface | Memory | Tingle |
|---|---|---|
| Quick chat | none | no |
| Project analyst | this project | optional, via the switch |

The urgency log is a feed. Sources are a footer. Do not add a third chat.

---

## Tingle (the switch)

Keep running the same job against the **baseline**. Classify what moved. Interrupt by **urgency index**, not by “it is Monday.”

They pick a **digest floor**: daily or weekly. That covers **Note** (and a rollup of **Soon** they already got). **Now** never waits for the digest.

Default: Now always, Soon same-day, Note in the digest. They can set “email me Now only.”

Quiet hours: Now still emails. No SMS in v1.

Cadence is a floor, not the product. Silence is a valid digest: “nothing close this week.”
