# `.tingle/` tree format

The encrypted vault is the default. **Keep this on my GitHub** is opt-in: the
same watch object is written into a **private** repo so you can revoke Tingle
and still have the files. Login OAuth never includes `repo` scope. Connecting
a repo is a second, explicit ask (PAT with `contents:write`, or GitHub OAuth
with `repo` at toggle time).

Public repos are rejected. A public `.tingle/` tree would leak the claim.

## Layout

```
.tingle/
  README.md           # pointer at this spec
  profile.yml         # JSON-compatible YAML 1.2 (the watch profile)
  baseline.json       # first-look urls + hashes, not commentary
  artifacts/
    pitch.txt         # omitted when stealth is on
    docs.md           # optional
  events/
    {iso}-{id}.json   # append-only classified events
```

`profile.yml` is `JSON.stringify(profile, null, 2)`. That is valid YAML 1.2
and matches [pipeline.md](pipeline.md) `WatchProfile`:

```
project_id, stage, claim, fingerprints[], must_match[], ignore[],
sources[], baseline_ids[], github_url, patent_number, links[],
watch_list[], tingle_on, alert_email, digest_floor, budget,
paused, stealth, storage, github_repo
```

Events are the classified feed objects (`type`, `urgency`, `sources[]`), not
raw HitRows.

## What we still hold

Even with GitHub storage we see the claim **while a job runs**, and we keep
email, `c_*` ids, and budget counters. Revoke drops the pitch, token, and
tree cache. Leftover: email + collectors + budget.

## What this is not

Not a signup requirement. Not a public format blog before the product existed
(the product exists as of Phase 7). Not a Bright Data dashboard export.
