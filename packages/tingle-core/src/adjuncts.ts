import { HitRowSchema, domainFromUrl, type HitRow } from "./schema/hits.js";

/**
 * Public JSON APIs used alongside the owned collectors.
 *
 * These are direct HTTP calls, not scrapes — they are designed for programmatic
 * access, so routing them through a scraper would be slower, more expensive and
 * less reliable. They are always labelled `adjunct`, they never substitute for a
 * collector, and they are never healed: we do not own their selectors, so a
 * schema change here is their release note, not our incident.
 */
export type AdjunctName = "hn" | "arxiv" | "github" | "uspto";

export type AdjunctResult = {
  name: AdjunctName;
  ok: boolean;
  rows: HitRow[];
  /** Present when the source did not come back. Surfaced, never swallowed. */
  error?: string;
};

const UA = "tingle-first-look (public API client)";

async function getJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function getText(url: string, timeoutMs = 25_000): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function row(partial: {
  title: string;
  url: string;
  snippet: string;
  published_at?: string | null;
}): HitRow | null {
  const parsed = HitRowSchema.safeParse({
    source: "adjunct",
    title: partial.title,
    url: partial.url,
    snippet: partial.snippet,
    published_at: partial.published_at ?? null,
    source_domain: domainFromUrl(partial.url),
  });
  // Adjunct rows go through the same schema, but a rejection here is not a
  // heal incident — there is no extractor of ours to repair. Drop and move on.
  return parsed.success ? parsed.data : null;
}

function clip(s: string, n = 400): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Hacker News, via the public Algolia search API. */
export async function fetchHackerNews(
  query: string,
  limit = 15,
): Promise<AdjunctResult> {
  try {
    const url =
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
      `&hitsPerPage=${limit}&tags=(story,show_hn)`;
    const body = (await getJson(url)) as {
      hits?: Array<{
        title?: string;
        story_title?: string;
        url?: string;
        story_url?: string;
        objectID?: string;
        story_text?: string;
        comment_text?: string;
        created_at?: string;
        points?: number;
        num_comments?: number;
      }>;
    };
    const rows: HitRow[] = [];
    for (const h of body.hits ?? []) {
      const title = h.title ?? h.story_title ?? "";
      const link =
        h.url ??
        h.story_url ??
        (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : "");
      if (!title || !link) continue;
      const discussion = [
        h.points !== undefined ? `${h.points} points` : "",
        h.num_comments !== undefined ? `${h.num_comments} comments` : "",
      ]
        .filter(Boolean)
        .join(", ");
      const text = clip(h.story_text ?? h.comment_text ?? "");
      const r = row({
        title,
        url: link,
        // Titles alone score poorly, so give the matcher the discussion text
        // when there is any, and the vote/comment counts when there is not.
        snippet: text || discussion || "Hacker News discussion",
        published_at: h.created_at ?? null,
      });
      if (r) rows.push(r);
    }
    return { name: "hn", ok: true, rows };
  } catch (err) {
    return { name: "hn", ok: false, rows: [], error: message(err) };
  }
}

/** arXiv, via its public Atom API. */
export async function fetchArxiv(
  query: string,
  limit = 10,
): Promise<AdjunctResult> {
  try {
    const url =
      `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
        `"${query}"`,
      )}&start=0&max_results=${limit}`;
    const xml = await getText(url);
    const rows: HitRow[] = [];
    // Small, well-formed, controlled feed — a regex pass beats adding an XML
    // dependency for four fields.
    for (const entry of xml.split("<entry>").slice(1)) {
      const pick = (tag: string) =>
        entry.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? "";
      const title = decodeXml(pick("title"));
      const id = pick("id");
      const summary = decodeXml(pick("summary"));
      const published = pick("published");
      if (!title || !id) continue;
      const r = row({
        title,
        url: id,
        snippet: clip(summary),
        published_at: published || null,
      });
      if (r) rows.push(r);
    }
    return { name: "arxiv", ok: true, rows };
  } catch (err) {
    return { name: "arxiv", ok: false, rows: [], error: message(err) };
  }
}

/**
 * A repo the builder pasted, read over the public REST API.
 *
 * This is their own repo as *data*, and only when the GitHub input is on. It is
 * not Bright Data's GitHub scraper, and it is not a login-gated fetch.
 */
export async function fetchGithubRepo(repoUrl: string): Promise<AdjunctResult> {
  try {
    const m = repoUrl.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
    if (!m) throw new Error(`not a github repo url: ${repoUrl}`);
    const owner = m[1]!;
    const repo = m[2]!.replace(/\.git$/, "");

    const meta = (await getJson(
      `https://api.github.com/repos/${owner}/${repo}`,
    )) as {
      full_name?: string;
      html_url?: string;
      description?: string | null;
      pushed_at?: string;
      language?: string | null;
      topics?: string[];
      stargazers_count?: number;
    };

    let readme = "";
    try {
      const rd = (await getJson(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
      )) as { content?: string; encoding?: string };
      if (rd.content && rd.encoding === "base64") {
        readme = Buffer.from(rd.content, "base64").toString("utf8");
      }
    } catch {
      // A repo with no README is normal; the metadata is still useful.
    }

    // The README's first real paragraph is the promise the repo makes, which is
    // what the claim should actually be checked against.
    const promise = firstProse(readme);
    const bits = [
      meta.description ?? "",
      promise,
      meta.language ? `language ${meta.language}` : "",
      meta.topics?.length ? `topics ${meta.topics.join(", ")}` : "",
    ].filter(Boolean);

    const r = row({
      title: meta.full_name ?? `${owner}/${repo}`,
      url: meta.html_url ?? `https://github.com/${owner}/${repo}`,
      snippet: clip(bits.join(". "), 600),
      published_at: meta.pushed_at ?? null,
    });
    return { name: "github", ok: true, rows: r ? [r] : [] };
  } catch (err) {
    return { name: "github", ok: false, rows: [], error: message(err) };
  }
}

/**
 * USPTO patent lookup.
 *
 * The keyless PatentsView endpoint was retired — `api.patentsview.org` now
 * redirects to a transition guide, and the replacement requires a key. Rather
 * than quietly dropping the lane, this reports as unavailable so the analyst
 * can say the source did not come back. Set TINGLE_USPTO_API_KEY to enable it.
 */
export async function fetchUspto(
  query: string,
  apiKey?: string,
): Promise<AdjunctResult> {
  if (!apiKey) {
    return {
      name: "uspto",
      ok: false,
      rows: [],
      error:
        "no API key — the keyless PatentsView endpoint was retired; set TINGLE_USPTO_API_KEY to enable this lane",
    };
  }
  try {
    const q = encodeURIComponent(JSON.stringify({ _text_any: { patent_title: query } }));
    const f = encodeURIComponent(
      JSON.stringify(["patent_id", "patent_title", "patent_date", "patent_abstract"]),
    );
    const body = (await getJson(
      `https://search.patentsview.org/api/v1/patent/?q=${q}&f=${f}&o=${encodeURIComponent(
        JSON.stringify({ size: 10 }),
      )}&api_key=${encodeURIComponent(apiKey)}`,
    )) as {
      patents?: Array<{
        patent_id?: string;
        patent_title?: string;
        patent_date?: string;
        patent_abstract?: string;
      }>;
    };
    const rows: HitRow[] = [];
    for (const p of body.patents ?? []) {
      if (!p.patent_id || !p.patent_title) continue;
      const r = row({
        title: p.patent_title,
        url: `https://patents.google.com/patent/US${p.patent_id}`,
        snippet: clip(p.patent_abstract ?? "US patent"),
        published_at: p.patent_date ?? null,
      });
      if (r) rows.push(r);
    }
    return { name: "uspto", ok: true, rows };
  } catch (err) {
    return { name: "uspto", ok: false, rows: [], error: message(err) };
  }
}

function firstProse(markdown: string): string {
  for (const block of markdown.split(/\n\s*\n/)) {
    const line = block
      .replace(/^#+\s.*$/gm, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_>|-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length > 40) return line;
  }
  return "";
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function message(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "AbortError" ? "timed out" : err.message;
  }
  return String(err);
}
