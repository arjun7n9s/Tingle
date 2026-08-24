import { domainFromUrl } from "./schema/hits.js";
import {
  parseGithubRepo,
  isStrongToken,
  isDistinctiveToken,
  isAmbientToken,
  isGenericTech,
  tokens,
} from "./claim.js";
import type { PileableHit } from "./piles.js";
import type { TingleConfig } from "./config.js";
import { fetchT } from "./edge/fetchT.js";

export type AdjunctSource = "hn" | "arxiv" | "openalex" | "crossref" | "uspto" | "github_rest";

export type AdjunctResult = {
  rows: PileableHit[];
  sources_used: string[];
  collectors_failed: string[];
};

const UA = "Tingle/0.1 (claim-watch; +https://dev.to/t/indiehackers)";

function pairRank(parts: string[]): number {
  if (parts.length !== 2) return 0;
  if (parts.some(isAmbientToken)) return 0;
  const distinctive = parts.filter(isDistinctiveToken);
  const generic = parts.filter(isGenericTech);
  if (!distinctive.length && !generic.length) return 0;
  return (
    distinctive.length * 1000 +
    generic.length * 400 +
    parts.reduce(
      (sum, p) =>
        sum + (isDistinctiveToken(p) ? p.length + 10 : isGenericTech(p) ? p.length + 4 : 1),
      0,
    )
  );
}

/**
 * Distinctive phrases for HN / arXiv / OpenAlex. Never a whole pitch, never
 * the longest generic pair ("autonomous ultrasonic").
 */
export function adjunctSearchQueries(
  claim: string | undefined,
  fingerprints: string[],
  limit = 2,
): string[] {
  const pairs = fingerprints
    .map((f) => ({ f, parts: f.split(/\s+/) }))
    .filter(
      ({ parts }) =>
        parts.length === 2 &&
        parts.every(isStrongToken) &&
        !parts.some(isAmbientToken) &&
        (parts.some(isDistinctiveToken) || parts.some(isGenericTech)),
    )
    .map((p) => ({ ...p, rank: pairRank(p.parts) }))
    .filter((p) => p.rank > 0)
    .sort(
      (a, b) =>
        b.rank - a.rank || fingerprints.indexOf(a.f) - fingerprints.indexOf(b.f),
    );
  const out: string[] = [];
  for (const p of pairs) {
    if (out.includes(p.f)) continue;
    out.push(p.f);
    if (out.length >= limit) return out;
  }
  if (!out.length) {
    const uni = [
      ...new Set(
        tokens(claim ?? "").filter((t) => isDistinctiveToken(t) || isGenericTech(t)),
      ),
    ].sort((a, b) => b.length - a.length || a.localeCompare(b));
    if (uni.length >= 2) out.push(`${uni[0]} ${uni[1]}`);
    else if (uni[0]) out.push(uni[0]);
  }
  if (!out.length) {
    out.push(
      fingerprints.find((f) => isDistinctiveToken(f)) ||
        fingerprints.find((f) => f.length >= 4) ||
        "indie product",
    );
  }
  return out;
}

export function adjunctSearchQuery(
  claim: string | undefined,
  fingerprints: string[],
): string {
  return adjunctSearchQueries(claim, fingerprints, 1)[0] ?? "indie product";
}

/**
 * Labeled extra rows. Never the qualifying path — if Studio is down we say
 * so rather than silently becoming an API mashup.
 */
export async function fetchAdjuncts(
  config: TingleConfig,
  opts: {
    fingerprints: string[];
    claim?: string;
    githubUrl?: string;
    patentNumber?: string;
    queries?: string[];
  },
): Promise<AdjunctResult> {
  if (config.mock) return mockAdjuncts(opts);

  const queries = (opts.queries?.filter(Boolean).length
    ? opts.queries.filter(Boolean)
    : adjunctSearchQueries(opts.claim, opts.fingerprints, 2)
  ).slice(0, 4);
  const jobs: Promise<{
    source: string;
    rows: PileableHit[];
    error?: string;
  }>[] = [];
  for (const query of queries) {
    jobs.push(safe("hn", () => fetchHn(query)));
    jobs.push(safe("arxiv", () => fetchArxiv(query)));
    jobs.push(safe("openalex", () => fetchOpenAlex(query)));
    jobs.push(safe("crossref", () => fetchCrossref(query)));
  }

  if (opts.githubUrl) {
    jobs.push(safe("github_rest", () => fetchGithub(opts.githubUrl!)));
  }
  jobs.push(
    safe("uspto", () =>
      fetchUspto(opts.patentNumber, queries[0] ?? "", config.usptoApiKey, 5),
    ),
  );

  const settled = await Promise.all(jobs);
  const rows: PileableHit[] = [];
  const seen = new Set<string>();
  const ok = new Set<string>();
  const failNotes: string[] = [];
  for (const r of settled) {
    if (r.error) {
      failNotes.push(`${r.source}: ${r.error}`);
      continue;
    }
    ok.add(r.source);
    for (const row of r.rows) {
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      rows.push(row);
    }
  }
  return {
    rows,
    sources_used: [...ok],
    collectors_failed: failNotes.filter((note) => !ok.has(note.split(":")[0] ?? "")),
  };
}

/**
 * Deep prior-art corpus. Same JSON adjuncts as first look, many distinctive
 * queries, higher USPTO limits. Not a Studio collector.
 */
export async function fetchPriorArt(
  config: TingleConfig,
  opts: {
    claim: string;
    fingerprints: string[];
    patentNumber?: string;
    queries?: string[];
  },
): Promise<AdjunctResult> {
  if (config.mock) return mockPriorArt(opts);

  const queries = (opts.queries?.filter(Boolean).length
    ? opts.queries.filter(Boolean)
    : adjunctSearchQueries(opts.claim, opts.fingerprints, 5)
  ).slice(0, 5);
  const jobs: Promise<{
    source: string;
    rows: PileableHit[];
    error?: string;
  }>[] = [];
  for (const query of queries) {
    jobs.push(safe("uspto", () => fetchUspto(opts.patentNumber, query, config.usptoApiKey, 12)));
    jobs.push(safe("arxiv", () => fetchArxiv(query, 8)));
    jobs.push(safe("openalex", () => fetchOpenAlex(query, 8)));
    jobs.push(safe("crossref", () => fetchCrossref(query, 8)));
  }
  const settled = await Promise.all(jobs);
  const rows: PileableHit[] = [];
  const seen = new Set<string>();
  const ok = new Set<string>();
  const failNotes: string[] = [];
  for (const r of settled) {
    if (r.error) {
      failNotes.push(`${r.source}: ${r.error}`);
      continue;
    }
    ok.add(r.source);
    for (const row of r.rows) {
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      rows.push(row);
    }
  }
  return {
    rows,
    sources_used: [...ok],
    collectors_failed: failNotes.filter((note) => !ok.has(note.split(":")[0] ?? "")),
  };
}

function mockPriorArt(opts: {
  claim: string;
  fingerprints: string[];
}): AdjunctResult {
  const blob = `${opts.claim} ${opts.fingerprints.join(" ")}`.toLowerCase();
  const hull = /hull|ultrasonic|thickness|c.?scan|rover/.test(blob);
  const rows: PileableHit[] = hull
    ? [
        {
          source: "uspto",
          title: "Magnetic crawler for ultrasonic thickness mapping of ship hulls",
          url: "https://patents.google.com/patent/US8123456B2",
          snippet:
            "A magnetically coupled rover takes point-to-point ultrasonic A/B/C-scan readings on steel hull plates and stores thickness maps.",
          published_at: "2012-04-01T00:00:00.000Z",
          source_domain: "uspto.gov",
        },
        {
          source: "uspto",
          title: "Wireless C-scan ultrasonic inspection of large metal structures",
          url: "https://patents.google.com/patent/US7654321B2",
          snippet:
            "A probe head performs C-scan ultrasonics and radios defect coordinates to a remote station.",
          published_at: "2010-11-01T00:00:00.000Z",
          source_domain: "uspto.gov",
        },
        {
          source: "openalex",
          title: "Robotic ultrasonic NDT for ship hull plate thickness",
          url: "https://doi.org/10.0000/hull-ut-rover",
          snippet:
            "Survey of hull-climbing robots that couple ultrasonic transducers for remaining-wall measurement.",
          published_at: "2019-06-01T00:00:00.000Z",
          source_domain: "openalex.org",
        },
        {
          source: "uspto",
          title: "Fully autonomous passenger car with lane-keeping",
          url: "https://patents.google.com/patent/US9999999B2",
          snippet: "A road vehicle drives itself on public streets.",
          published_at: "2018-01-01T00:00:00.000Z",
          source_domain: "uspto.gov",
        },
      ]
    : [
        {
          source: "uspto",
          title: "Watching public web listings for a confirmed product claim",
          url: "https://patents.google.com/patent/US1111111B2",
          snippet:
            "A system matches a one-sentence product claim against public HTML launch boards.",
          published_at: "2021-01-01T00:00:00.000Z",
          source_domain: "uspto.gov",
        },
      ];
  return {
    rows,
    sources_used: ["uspto", "openalex"],
    collectors_failed: [],
  };
}

function mockAdjuncts(opts: {
  fingerprints: string[];
  claim?: string;
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
          source: "openalex",
          title: "Public listing watch for confirmed product claims",
          url: "https://openalex.org/W0000000000",
          snippet:
            "Scholarly work on fingerprinting a builder's claim against public HTML launches.",
          published_at: "2025-09-01T00:00:00.000Z",
          source_domain: "openalex.org",
        },
        {
          source: "crossref",
          title: "Matching a product claim against public launch listings",
          url: "https://doi.org/10.0000/claim-watch",
          snippet:
            "A Crossref-indexed paper on fingerprinting a one-sentence product claim.",
          published_at: "2025-08-01T00:00:00.000Z",
          source_domain: "doi.org",
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
      ? ["hn", "arxiv", "openalex", "crossref", "github_rest"]
      : ["hn", "arxiv", "openalex", "crossref"],
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
  const phrase = /\s/.test(query) ? `"${query.replace(/"/g, "")}"` : query;
  url.searchParams.set("query", phrase);
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", "8");
  url.searchParams.set("advancedSyntax", "true");
  url.searchParams.set("typoTolerance", "false");
  const res = await fetchT(url, { headers: { "User-Agent": UA } }, 10_000);
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

async function fetchOpenAlex(query: string, limit = 5): Promise<PileableHit[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", String(Math.min(25, Math.max(1, limit))));
  url.searchParams.set("sort", "relevance_score:desc");
  const res = await fetchT(url, { headers: { "User-Agent": UA } }, 10_000);
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
  const body = (await res.json()) as {
    results?: {
      id?: string;
      doi?: string | null;
      display_name?: string;
      publication_date?: string;
      primary_location?: { landing_page_url?: string | null };
    }[];
  };
  return (body.results ?? [])
    .map((w) => {
      const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "") ?? "";
      const link =
        w.primary_location?.landing_page_url ||
        (doi ? `https://doi.org/${doi}` : "") ||
        w.id ||
        "";
      if (!w.display_name || !link) return undefined;
      return {
        source: "openalex",
        title: w.display_name,
        url: link,
        snippet: w.display_name.slice(0, 400),
        published_at: w.publication_date ?? null,
        source_domain: domainFromUrl(link) || "openalex.org",
      } satisfies PileableHit;
    })
    .filter((x): x is PileableHit => Boolean(x));
}

async function fetchCrossref(query: string, limit = 5): Promise<PileableHit[]> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(Math.min(25, Math.max(1, limit))));
  url.searchParams.set("select", "DOI,title,abstract,created,URL");
  const res = await fetchT(
    url,
    {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    },
    10_000,
  );
  if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
  const body = (await res.json()) as {
    message?: {
      items?: {
        DOI?: string;
        title?: string[];
        abstract?: string;
        URL?: string;
        created?: { "date-time"?: string };
      }[];
    };
  };
  return (body.message?.items ?? [])
    .map((w) => {
      const title = w.title?.[0]?.trim() ?? "";
      const doi = (w.DOI ?? "").replace(/^https?:\/\/doi\.org\//i, "");
      const link = w.URL || (doi ? `https://doi.org/${doi}` : "");
      if (!title || !link) return undefined;
      const abstract = (w.abstract ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        source: "crossref",
        title,
        url: link,
        snippet: (abstract || title).slice(0, 400),
        published_at: w.created?.["date-time"] ?? null,
        source_domain: domainFromUrl(link) || "doi.org",
      } satisfies PileableHit;
    })
    .filter((x): x is PileableHit => Boolean(x));
}

async function fetchArxiv(query: string, limit = 5): Promise<PileableHit[]> {
  const terms = tokens(query)
    .filter((t) => isDistinctiveToken(t) && t.length >= 4)
    .slice(0, 3);
  const fallback = tokens(query).filter((t) => t.length >= 4).slice(0, 3);
  const used = terms.length ? terms : fallback;
  const search =
    used.map((t) => `all:${t}`).join("+AND+") || "all:software";
  const url = `https://export.arxiv.org/api/query?search_query=${search}&start=0&max_results=${Math.min(25, Math.max(1, limit))}&sortBy=relevance&sortOrder=descending`;
  const res = await fetchT(url, { headers: { "User-Agent": UA } }, 10_000);
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
  const repoRes = await fetchT(
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
  const readmeRes = await fetchT(
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

async function readJson(res: Response, label: string): Promise<unknown> {
  const text = await res.text();
  const start = text.trimStart();
  if (!start || start.startsWith("<")) {
    throw new Error(
      `${label} returned a web page instead of patent JSON. PatentsView is retired — set USPTO_ODP_API_KEY (USPTO Open Data Portal).`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${label} returned non-JSON. Set USPTO_ODP_API_KEY for USPTO Open Data Portal.`,
    );
  }
}

async function fetchUspto(
  patentNumber: string | undefined,
  query: string,
  apiKey: string | undefined,
  limit = 5,
): Promise<PileableHit[]> {
  const cap = Math.min(25, Math.max(1, limit));
  if (!apiKey) {
    throw new Error(
      "USPTO PatentsView no longer returns JSON. Set USPTO_ODP_API_KEY to search the Open Data Portal.",
    );
  }
  const q = patentNumber
    ? `applicationMetaData.patentNumber:${patentNumber.replace(/[^0-9]/g, "")}`
    : tokens(query)
        .filter(isDistinctiveToken)
        .slice(0, 5)
        .join(" AND ") || query;
  const res = await fetchT(
    "https://api.uspto.gov/api/v1/patent/applications/search",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
        "User-Agent": UA,
      },
      body: JSON.stringify({
        q,
        pagination: { offset: 0, limit: cap },
        fields: [
          "applicationNumberText",
          "applicationMetaData.inventionTitle",
          "applicationMetaData.patentNumber",
          "applicationMetaData.filingDate",
        ],
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`USPTO Open Data Portal HTTP ${res.status}`);
  }
  const body = (await readJson(res, "USPTO")) as {
    patentFileWrapperDataBag?: {
      applicationNumberText?: string;
      applicationMetaData?: Record<string, string | undefined>;
    }[];
  };
  return (body.patentFileWrapperDataBag ?? []).map((p) => {
    const meta = p.applicationMetaData ?? {};
    const num = meta.patentNumber || p.applicationNumberText || "uspto";
    const title =
      meta.inventionTitle || meta.inventionTitle || `USPTO ${num}`;
    return {
      source: "uspto",
      title,
      url: `https://patents.google.com/patent/US${num}`,
      snippet: `USPTO record ${num}`,
      published_at: meta.filingDate ?? null,
      source_domain: "uspto.gov",
    } satisfies PileableHit;
  });
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
