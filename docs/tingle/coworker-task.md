# Coworker task: Web Unlocker markdown fetch

**Owner:** parallel agent (no prior chat).  
**Do not:** create Bright Data collectors, edit the analyst, auto-approve heals, or expand into MCP / Browser API / SERP Yandex.

## Goal

Add a thin Bright Data **Web Unlocker** client that fetches **one public URL** as markdown. This is for **patent / paper detail pages** after a Google Patents listing row exists. It is **not** a replacement for the Search collector.

API (locked shape):

`POST https://api.brightdata.com/request`

Typical JSON body (match current Bright Data docs if they differ; do not invent extra products):

```json
{
  "zone": "TINGLE_UNLOCKER_ZONE",
  "url": "https://patents.google.com/patent/US20140142851A1",
  "format": "raw"
}
```

If the account uses `data_format: "markdown"`, pass that instead of inventing a second HTTP API. Prefer markdown when the zone supports it; otherwise return text/html and let the caller truncate.

## Files to add / touch

| File | Action |
|---|---|
| `packages/tingle-core/src/bd/unlocker.ts` | **Create.** `fetchUnlockerMarkdown(config, url) → { markdown, status, bytes }` |
| `packages/tingle-core/src/bd/unlocker.test.ts` | **Create.** Mock: no token / `TINGLE_MOCK=1` returns a fixture string, does not call the network. Live path skipped unless token+zone present. |
| `packages/tingle-core/src/config.ts` | Read optional `TINGLE_UNLOCKER_ZONE`. Empty = skip (not a crash). |
| `.env.example` | Comment-only `TINGLE_UNLOCKER_ZONE=` |
| `packages/tingle-core/src/index.ts` | Export the function if other jobs already export `bd/*` helpers |

Do **not** wire this into `firstLook` or `tingleTick` yet. Export + unit tests only. Wiring is a later PR so we do not spend Unlocker credits on every look.

## Behavior

- Missing token or missing zone or `config.mock` → return `{ skipped: true, reason: "..." }` without HTTP.
- Timeout ~20s. Truncate markdown to ~20k chars.
- Log no API tokens.
- Country hint: optional `country` ISO code on the request if the Unlocker zone supports it; default omit.
- Public URLs only. Reject `javascript:` and non-https (except existing chaos fixture http if you must; prefer https).

## Out of scope

- MCP `extract` / `discover`
- Browser API / Puppeteer
- Yandex / Baidu / Naver SERP
- Changing `planLanes` or creating `TINGLE_C_PATENT`
- AIMLAPI in the analyst

## Done when

- `unlocker.test.ts` passes in mock.
- `loadTingleConfig` exposes `unlockerZone?: string`.
- No collector `create`. No secrets committed.

## Read first

`AGENTS.md`, `docs/tingle/architecture.md`, `docs/tingle/coworker.md`, existing `packages/tingle-core/src/bd/client.ts` and `packages/tingle-core/src/edge/fetchT.ts` for HTTP style.
