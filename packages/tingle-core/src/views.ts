import { ANALYST_CONTRACT } from "./analyst.js";
import { pileLabel, type Piles, type ScoredHit } from "./piles.js";
import type { WatchProfile } from "./schema/profile.js";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
:root{--bg:#0c0f16;--panel:#141924;--line:#242c3d;--text:#e6ebf5;--muted:#8e9bb5;--accent:#5ee6a8;--warn:#ffc266}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 "IBM Plex Sans",system-ui,-apple-system,Segoe UI,sans-serif}
a{color:var(--accent)}
main{max-width:820px;margin:0 auto;padding:2rem 1.25rem 4rem}
header.top{border-bottom:1px solid var(--line);padding:.9rem 1.25rem;display:flex;gap:1rem;align-items:baseline}
header.top .brand{font-weight:600;letter-spacing:-.01em}
header.top nav{margin-left:auto;display:flex;gap:1rem;font-size:.9rem}
h1{font-size:1.5rem;letter-spacing:-.02em;margin:0 0 .35rem}
h2{font-size:1.05rem;margin:2rem 0 .6rem}
p.sub{color:var(--muted);margin:0 0 1.5rem}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1.1rem 1.25rem;margin-bottom:1rem}
label{display:block;font-size:.85rem;color:var(--muted);margin:.9rem 0 .3rem}
input,textarea,select{width:100%;background:#0e131d;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:.6rem .7rem;font:inherit}
textarea{min-height:110px;resize:vertical}
button{background:var(--accent);color:#052b1c;border:0;border-radius:999px;padding:.6rem 1.2rem;font:inherit;font-weight:600;cursor:pointer;margin-top:1rem}
button.ghost{background:transparent;color:var(--text);border:1px solid var(--line);font-weight:400}
.err{border-color:#ff7b72;color:#ffb3ad;background:rgba(255,123,114,.08);padding:.7rem .9rem;border-radius:8px;border:1px solid #ff7b72;margin-bottom:1rem}
.hit{border-top:1px solid var(--line);padding:.8rem 0}
.hit:first-child{border-top:0}
.hit .t{font-weight:500}
.hit .u{font-size:.82rem;word-break:break-all}
.hit .m{font-size:.8rem;color:var(--muted);margin-top:.2rem}
.empty{color:var(--muted);font-style:italic}
.pill{display:inline-block;font-size:.72rem;border:1px solid var(--line);border-radius:999px;padding:.1rem .5rem;color:var(--muted);margin-right:.3rem}
details.sources{margin-top:1.5rem;border-top:1px solid var(--line);padding-top:.8rem}
details.sources summary{cursor:pointer;color:var(--muted);font-size:.88rem}
table{width:100%;border-collapse:collapse;font-size:.86rem;margin-top:.6rem}
td{padding:.25rem .4rem;border-top:1px solid var(--line);vertical-align:top}
.contract{color:var(--muted);font-size:.86rem;border-left:2px solid var(--line);padding-left:.8rem;margin:0 0 1.2rem}
.answer{white-space:pre-wrap;background:#0e131d;border:1px solid var(--line);border-radius:8px;padding:.8rem .9rem;margin-top:.8rem}
.row{display:flex;gap:.6rem;align-items:flex-end}
.row input{flex:1}
.row button{margin-top:0}
ul.doors{list-style:none;padding:0}
ul.doors li{margin-bottom:.7rem}
`;

export function layout(
  title: string,
  body: string,
  opts: { email?: string | null } = {},
): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<header class="top"><span class="brand">Tingle</span>
<nav>${
    opts.email
      ? `<a href="/">Home</a><span class="pill">${esc(opts.email)}</span>
         <form method="post" action="/logout" style="display:inline"><button class="ghost" style="padding:.2rem .7rem;margin:0">Sign out</button></form>`
      : `<a href="/login">Sign in</a><a href="/signup">Create account</a>`
  }</nav></header>
<main>${body}</main></body></html>`;
}

export function signupPage(error?: string): string {
  return layout(
    "Create account — Tingle",
    `<h1>Create an account</h1>
     <p class="sub">Email and a password. That is the whole signup — we ask for
     a repo only if you later turn that input on for a project.</p>
     ${error ? `<div class="err">${esc(error)}</div>` : ""}
     <form method="post" action="/signup" class="card">
       <label for="email">Email</label>
       <input id="email" name="email" type="email" required autocomplete="email">
       <label for="password">Password (10 characters or more)</label>
       <input id="password" name="password" type="password" required autocomplete="new-password">
       <button type="submit">Create account</button>
     </form>
     <p class="sub">Already have one? <a href="/login">Sign in</a>.</p>`,
  );
}

export function loginPage(error?: string): string {
  return layout(
    "Sign in — Tingle",
    `<h1>Sign in</h1>
     ${error ? `<div class="err">${esc(error)}</div>` : ""}
     <form method="post" action="/login" class="card">
       <label for="email">Email</label>
       <input id="email" name="email" type="email" required autocomplete="email">
       <label for="password">Password</label>
       <input id="password" name="password" type="password" required autocomplete="current-password">
       <button type="submit">Sign in</button>
     </form>
     <p class="sub">No account? <a href="/signup">Create one</a>.</p>`,
  );
}

export function homePage(email: string, projects: WatchProfile[]): string {
  const list = projects.length
    ? `<div class="card">${projects
        .map(
          (p) => `<div class="hit">
            <div class="t"><a href="/project/${esc(p.project_id)}">${esc(p.claim)}</a></div>
            <div class="m"><span class="pill">${esc(p.stage)}</span>
              ${p.baseline_ids.length} baseline hit(s) · updated ${esc(
                p.updated_at.slice(0, 10),
              )}</div>
          </div>`,
        )
        .join("")}</div>`
    : `<p class="empty">No projects yet.</p>`;

  return layout(
    "Tingle",
    `<h1>You</h1>
     <p class="sub">Two doors, plus what you have already started.</p>
     <ul class="doors">
       <li><a href="/quick-chat"><strong>Quick chat</strong></a> —
         one look at the public web, no project, no memory.</li>
       <li><a href="/new-project"><strong>New project</strong></a> —
         confirm a claim, get a first look, keep it.</li>
     </ul>
     <h2>Projects</h2>
     ${list}`,
    { email },
  );
}

const STAGE_QUESTION: Record<string, string> = {
  starting: "Who can know? (stealth is the default assumption)",
  building: "What should we trust most — the repo, the docs, or what you type?",
  shipped: "What are we protecting — the product, the filing, or both?",
};

export function newProjectPage(opts: {
  email: string;
  error?: string;
  proposed?: string;
  fingerprints?: string[];
  form?: Record<string, string>;
}): string {
  const f = opts.form ?? {};
  const stage = f.stage ?? "starting";
  const confirming = Boolean(opts.proposed);

  return layout(
    "New project — Tingle",
    `<h1>New project</h1>
     <p class="sub">One screen. We confirm the sentence before spending
     anything on it.</p>
     ${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ""}
     <form method="post" action="/new-project" class="card">
       <label for="stage">Where are you?</label>
       <select id="stage" name="stage">
         <option value="starting"${stage === "starting" ? " selected" : ""}>Starting off — no public build yet</option>
         <option value="building"${stage === "building" ? " selected" : ""}>In progress — a repo or work in flight</option>
         <option value="shipped"${stage === "shipped" ? " selected" : ""}>Done with the build — live, or filed</option>
       </select>
       <p class="m" style="color:var(--muted);font-size:.82rem;margin:.4rem 0 0">${esc(
         STAGE_QUESTION[stage] ?? "",
       )}</p>

       <label for="pitch">Pitch — in your words</label>
       <textarea id="pitch" name="pitch" placeholder="What are you building?">${esc(f.pitch ?? "")}</textarea>

       <label for="links">Links (one per line) — a product, a paper, a known rival</label>
       <textarea id="links" name="links" style="min-height:70px">${esc(f.links ?? "")}</textarea>

       <label for="github_repo">Repo URL (optional) — read over the public API, not scraped</label>
       <input id="github_repo" name="github_repo" value="${esc(f.github_repo ?? "")}">

       <label for="ignore">Ignore (one per line) — looks like you, is not</label>
       <textarea id="ignore" name="ignore" style="min-height:60px">${esc(f.ignore ?? "")}</textarea>

       ${
         confirming
           ? `<label for="claim">Confirm the claim — this sentence <em>is</em> the watch</label>
              <textarea id="claim" name="claim" style="min-height:80px">${esc(opts.proposed)}</textarea>
              <p style="color:var(--muted);font-size:.82rem;margin:.4rem 0 0">
                Fingerprints: ${esc((opts.fingerprints ?? []).slice(0, 8).join(", "))}
              </p>
              <input type="hidden" name="confirmed" value="1">
              <button type="submit">Run first look</button>`
           : `<button type="submit">Draft the claim</button>
              <p style="color:var(--muted);font-size:.82rem;margin:.6rem 0 0">
                Nothing is scraped until you confirm the sentence.
              </p>`
       }
     </form>`,
    { email: opts.email },
  );
}

function hitRow(h: ScoredHit, projectId?: string): string {
  return `<div class="hit">
    <div class="t">${esc(h.title)}</div>
    <div class="u"><a href="${esc(h.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(h.url)}</a></div>
    <div class="m"><span class="pill">${esc(h.origin)}</span>${esc(h.reason)}${
      h.also_recent ? ' <span class="pill">also recent</span>' : ""
    }</div>
    ${
      projectId
        ? `<form method="post" action="/project/${esc(projectId)}/mute" style="display:inline">
             <input type="hidden" name="url" value="${esc(h.url)}">
             <button class="ghost" style="padding:.15rem .6rem;font-size:.78rem;margin-top:.4rem">Mute this URL</button>
           </form>`
        : ""
    }
  </div>`;
}

export function pilesBlock(piles: Piles, projectId?: string): string {
  return (Object.keys(piles) as Array<keyof Piles>)
    .map((key) => {
      const rows = piles[key];
      return `<h2>${esc(pileLabel(key, rows.length))}</h2>
        ${
          rows.length
            ? `<div class="card">${rows.map((h) => hitRow(h, projectId)).join("")}</div>`
            : ""
        }`;
    })
    .join("");
}

export function sourcesFooter(
  sources: Array<{ name: string; ok: boolean; rows: number; error?: string }>,
): string {
  return `<details class="sources">
    <summary>Sources used this turn (${sources.filter((s) => s.ok).length}/${sources.length})</summary>
    <table>${sources
      .map(
        (s) => `<tr><td>${esc(s.name)}</td><td>${
          s.ok
            ? `${s.rows} row(s)`
            : `<span style="color:var(--warn)">did not come back</span> — ${esc(
                s.error ?? "no reason reported",
              )}`
        }</td></tr>`,
      )
      .join("")}</table>
  </details>`;
}

export function projectPage(opts: {
  email: string;
  profile: WatchProfile;
  look: any;
  answer?: { text: string; rows: ScoredHit[]; tool: string | null };
  question?: string;
}): string {
  const { profile, look } = opts;
  return layout(
    "Project — Tingle",
    `<h1>${esc(profile.claim)}</h1>
     <p class="sub"><span class="pill">${esc(profile.stage)}</span>
       claim lock ${esc(profile.claim_lock)} ·
       ${profile.baseline_ids.length} baseline hit(s) ·
       budget ${profile.budget.spent_page_loads}/${profile.budget.cap_page_loads} page loads</p>

     <p class="contract">${esc(ANALYST_CONTRACT)}</p>

     ${look ? pilesBlock(look.piles, profile.project_id) : '<p class="empty">No first look stored yet.</p>'}

     <h2>Project analyst</h2>
     <form method="post" action="/project/${esc(profile.project_id)}/ask" class="card">
       <div class="row">
         <input name="question" placeholder="What did the search collector return?" value="${esc(
           opts.question ?? "",
         )}">
         <button type="submit">Ask</button>
       </div>
       ${
         opts.answer
           ? `<div class="answer">${esc(opts.answer.text)}</div>
              ${
                opts.answer.rows.length
                  ? `<div style="margin-top:.6rem">${opts.answer.rows
                      .map((h) => hitRow(h))
                      .join("")}</div>`
                  : ""
              }
              <p style="color:var(--muted);font-size:.78rem;margin-top:.6rem">
                ${opts.answer.tool ? `answered by tool: ${esc(opts.answer.tool)}` : "no tool covered this"}
              </p>`
           : ""
       }
     </form>

     ${look ? sourcesFooter(look.sources ?? []) : ""}

     <h2>Tingle</h2>
     <div class="card">
       <p style="margin:0;color:var(--muted)">The watch is off. Turning it on
       needs an email to alert, and is the next phase of work.</p>
     </div>`,
    { email: opts.email },
  );
}

export function quickChatPage(opts: {
  email: string;
  question?: string;
  result?: any;
  error?: string;
}): string {
  return layout(
    "Quick chat — Tingle",
    `<h1>Quick chat</h1>
     <p class="sub">One look, no project, no memory, no watch. If the answer
     bites, turn it into a project.</p>
     <p class="contract">${esc(ANALYST_CONTRACT)}</p>
     ${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ""}
     <form method="post" action="/quick-chat" class="card">
       <label for="q">What are you thinking of building?</label>
       <textarea id="q" name="q" style="min-height:80px">${esc(opts.question ?? "")}</textarea>
       <button type="submit">Take one look</button>
     </form>
     ${
       opts.result
         ? `${pilesBlock(opts.result.piles)}
            ${sourcesFooter(opts.result.sources ?? [])}
            <form method="post" action="/new-project" class="card" style="margin-top:1.5rem">
              <input type="hidden" name="pitch" value="${esc(opts.question ?? "")}">
              <p style="margin:0 0 .2rem"><strong>Turn this into a project</strong></p>
              <p style="margin:0;color:var(--muted);font-size:.86rem">
                Carries the claim over. We will ask where you are then — it is not assumed.
              </p>
              <button type="submit">Turn into a project</button>
            </form>`
         : ""
     }`,
    { email: opts.email },
  );
}
