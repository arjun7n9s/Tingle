import { domainFromUrl } from "./schema/hits.js";
import { parseGithubRepo, tokens } from "./claim.js";
import type { PileableHit } from "./piles.js";
import type { TingleConfig } from "./config.js";

export type AdjunctSource = "hn" | "arxiv" | "uspto" | "github_rest";

export type AdjunctResult = {
  rows: PileableHit[];
  sources_used: string[];
  collectors_failed: string[];
};

const UA = "Tingle/0.1 (claim-watch; +https://dev.to/t/indiehackers)";

/**
 * Labeled extra rows. Never the qualifying path — if Studio is down we say
 * so rather than silently becoming an API mashup.
 */
export async function fetchAdjuncts(
  config: TingleConfig,
  opts: {
    fingerprints: string[];
    githubUrl?: string;
    patentNumber?: string;
  },
): Promise<AdjunctResult> {
  if (config.mock) return mockAdjuncts(opts);

  const query = opts.fingerprints.slice(0, 6).join(" ");
  const jobs: Promise<{
    source: string;
    rows: PileableHit[];
    error?: string;
  }>[] = [
    safe("hn", () => fetchHn(query)),
    safe("arxiv", () => fetchArxiv(query)),
  ];

  if (opts.githubUrl) {
    jobs.push(safe("github_rest", () => fetchGithub(opts.githubUrl!)));
  }
  if (opts.patentNumber || config.usptoApiKey) {
    jobs.push(
      safe("uspto", () => fetchUspto(opts.patentNumber, query, config.usptoApiKey)),
    );
  }

  const settled = await Promise.all(jobs);
  const rows: PileableHit[] = [];
  const sources_used: string[] = [];
  const collectors_failed: string[] = [];
  for (const r of settled) {
    if (r.error) collectors_failed.push(`${r.source}: ${r.error}`);
    else {
      sources_used.push(r.source);
      rows.push(...r.rows);
    }
  }
  return { rows, sources_used, collectors_failed };
}

function mockAdjuncts(opts: {
  fingerprints: string[];
  githubUrl?: string;
  patentNumber?: string;
}): AdjunctResult {
  const rows: PileableHit[] = [
    {
      source: "hn",
      title: "Show HN: a public-web watch for when someone else ships your idea",
      url: "https://news.ycombinator.com/item?id=0",
      snippet:
        "Indie builders confirming one sentence, then watching launch boards for the same job.",
      published_at: "2026-03-01T00:00:00.000Z",
      source_domain: "news.ycombinator.com",
    },
    {
      source: "arxiv",
      title: "Claim-level monitoring of public product launches",
      url: "https://arxiv.org/abs/0000.00000",
      snippet:
        "A preprint on matching a one-sentence product claim against public HTML listings.",
      published_at: "2025-11-02T00:00:00.000Z",
      source_domain: "arxiv.org",
    },
    {
      source: "hn",
      title: "Ask HN: best espresso machine under $200",
      url: "https://news.ycombinator.com/item?id=1",
      snippet: "Home coffee gear thread. Unrelated to product launches.",
      published_at: "2026-08-21T00:00:00.000Z",
      source_domain: "news.ycombinator.com",
    },
  ];
  if (opts.githubUrl) {
    rows.push({
      source: "github_rest",
      title: "example/claim-fingerprint",
      url: opts.githubUrl,
      snippet: "README: library that fingerprints a confirmed claim sentence.",
      published_at: "2026-04-02T00:00:00.000Z",
      source_domain: "github.com",
    });
  }
  const failed: string[] = [];
  if (opts.patentNumber) {
    failed.push(
      "uspto: USPTO_ODP_API_KEY not set in mock — adjunct skipped, not invented",
    );
  }
  return {
    rows,
    sources_used: opts.githubUrl
      ? ["hn", "arxiv", "github_rest"]
      : ["hn", "arxiv"],
    collectors_failed: failed,
  };
}

function safe(
  source: string,
  fn: () => Promise<PileableHit[]>,
): Promise<{ source: string; rows: PileableHit[]; error?: string }> {
  return fn()
    .then((rows) => ({ source, rows }))
    .catch((err: unknown) => ({
      source,
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    }));
}

async function fetchHn(query: string): Promise<PileableHit[]> {
  const url = new URL("https://hn.algolia.com/api/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", "8");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
  const body = (await res.json()) as {
    hits?: {
      title?: string;
      url?: string;
      story_text?: string;
      created_at?: string;
      objectID?: string;
    }[];
  };
  return (body.hits ?? [])
    .map((h) => {
      const link =
        h.url ||
        (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : "");
      if (!h.title || !link) return undefined;
      return {
        source: "hn",
        title: h.title,
        url: link,
        snippet: (h.story_text || h.title).slice(0, 400),
        published_at: h.created_at ?? null,
        source_domain: domainFromUrl(link) || "news.ycombinator.com",
      } satisfies PileableHit;
    })
    .filter((x): x is PileableHit => Boolean(x));
}

async function fetchArxiv(query: string): Promise<PileableHit[]> {
  const terms = tokens(query).slice(0, 4);
  const search = terms.map((t) => `all:${t}`).join("+AND+") || "all:software";
  const url = `https://export.arxiv.org/api/query?search_query=${search}&start=0&max_results=5&sortBy=relevance&sortOrder=descending`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
  const xml = await res.text();
  return parseArxivAtom(xml);
}

function parseArxivAtom(xml: string): PileableHit[] {
  const entries = xml.split(/<entry>/).slice(1);
  const rows: PileableHit[] = [];
  for (const entry of entries) {
    const title = decode(tag(entry, "title")).replace(/\s+/g, " ").trim();
    const id = tag(entry, "id");
    const summary = decode(tag(entry, "summary")).replace(/\s+/g, " ").trim();
    const published = tag(entry, "published");
    if (!title || !id) continue;
    rows.push({
      source: "arxiv",
      title,
      url: id,
      snippet: summary.slice(0, 400) || title,
      published_at: published || null,
      source_domain: "arxiv.org",
    });
  }
  return rows;
}

async function fetchGithub(repoUrl: string): Promise<PileableHit[]> {
  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) throw new Error("not a github.com owner/repo URL");
  const headers = {
    "User-Agent": UA,
    Accept: "application/vnd.github+json",
  };
  const repoRes = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
    { headers },
  );
  if (!repoRes.ok) throw new Error(`GitHub HTTP ${repoRes.status}`);
  const repo = (await repoRes.json()) as {
    full_name?: string;
    html_url?: string;
    description?: string;
    created_at?: string;
    pushed_at?: string;
  };
  const readmeRes = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`,
    { headers: { ...headers, Accept: "application/vnd.github.raw" } },
  );
  const readme = readmeRes.ok ? (await readmeRes.text()).slice(0, 400) : "";
  const url = repo.html_url || repoUrl;
  return [
    {
      source: "github_rest",
      title: repo.full_name || `${parsed.owner}/${parsed.repo}`,
      url,
      snippet: (readme || repo.description || "GitHub repository").slice(0, 400),
      published_at: repo.pushed_at || repo.created_at || null,
      source_domain: "github.com",
    },
  ];
}

async function fetchUspto(
  patentNumber: string | undefined,
  query: string,
  apiKey: string | undefined,
): Promise<PileableHit[]> {
  if (apiKey) {
    const q = patentNumber
      ? `applicationMetaData.patentNumber:${patentNumber.replace(/[^0-9]/g, "")}`
      : query;
    const res = await fetch(
      "https://api.uspto.gov/api/v1/patent/applications/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
          "User-Agent": UA,
        },
        body: JSON.stringify({
          q,
          pagination: { offset: 0, limit: 5 },
          fields: [
            "applicationNumberText",
            "applicationMetaData.inventionTitle",
            "applicationMetaData.patentNumber",
            "applicationMetaData.filingDate",
          ],
        }),
      },
    );
    if (!res.ok) throw new Error(`USPTO ODP HTTP ${res.status}`);
    const body = (await res.json()) as {
      patentFileWrapperDataBag?: {
        applicationNumberText?: string;
        applicationMetaData?: {
          inventionTitle?: string;
          patentNumber?: string;
          filingDate?: string;
        };
      }[];
    };
    return (body.patentFileWrapperDataBag ?? []).map((p) => {
      const meta = p.applicationMetaData ?? {};
      const num = meta.patentNumber || p.applicationNumberText || "uspto";
      return {
        source: "uspto",
        title: meta.inventionTitle || `USPTO ${num}`,
        url: `https://patents.google.com/patent/US${num}`,
        snippet: `USPTO record ${num}`,
        published_at: meta.filingDate ?? null,
        source_domain: "uspto.gov",
      } satisfies PileableHit;
    });
  }

  // PatentsView is migrating to ODP and may 4xx. Try once; fail honestly.
  const res = await fetch(
    "https://api.patentsview.org/patents/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        q: patentNumber
          ? { patent_number: patentNumber.replace(/[^0-9]/g, "") }
          : { _text_any: { patent_abstract: query } },
        f: ["patent_number", "patent_title", "patent_abstract", "patent_date"],
        o: { per_page: 5 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `USPTO unavailable (HTTP ${res.status}; set USPTO_ODP_API_KEY for Open Data Portal)`,
    );
  }
  const body = (await res.json()) as {
    patents?: {
      patent_number?: string;
      patent_title?: string;
      patent_abstract?: string;
      patent_date?: string;
    }[];
  };
  return (body.patents ?? []).map((p) => ({
    source: "uspto",
    title: p.patent_title || `US ${p.patent_number}`,
    url: `https://patents.google.com/patent/US${p.patent_number}`,
    snippet: (p.patent_abstract || p.patent_title || "").slice(0, 400),
    published_at: p.patent_date ?? null,
    source_domain: "uspto.gov",
  }));
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m?.[1]?.trim() ?? "";
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
