/**
 * Owned collector registry.
 *
 * Search / Watch / Chaos are the Scrape-Verse proof pins (already created).
 * Patent offices and regional boards are create-once production pins.
 * Extra pasted URLs still reuse Watch `{url}` — never a new c_* for a paste.
 */

export const HIT_FAMILIES = [
  "search",
  "watch",
  "chaos",
  "patent",
  "regional",
] as const;
export type HitFamily = (typeof HIT_FAMILIES)[number];

export const STUDIO_KEYS = ["search", "watch", "chaos"] as const;
export type StudioKey = (typeof STUDIO_KEYS)[number];

/** Production patent lane — Google Patents Search. One pin, all offices Google indexed. */
export const PATENT_LANE = "patent" as const;

export const PATENT_KEYS = [
  "patent_uspto",
  "patent_epo",
  "patent_wipo",
  "patent_jpo",
  "patent_kipo",
  "patent_cnipa",
  "patent_ipos",
  "patent_rospatent",
] as const;
export type PatentKey = (typeof PATENT_KEYS)[number];

export const REGION_KEYS = [
  "region_us",
  "region_eu",
  "region_jp",
  "region_kr",
  "region_cn",
  "region_sg",
  "region_in",
  "region_ru",
] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

export type CollectorKey = StudioKey | typeof PATENT_LANE | PatentKey | RegionKey;

export type StudioType = "Search" | "Discovery";

export type CollectorSpec = {
  key: CollectorKey;
  env: string;
  family: HitFamily;
  type: StudioType;
  name: string;
  url: string;
  /** ISO country this lane is “home” for. */
  country?: string;
  region?: string;
  office?: string;
  /**
   * Reuse an existing pin instead of creating. `region_us` → Watch (Uneed).
   */
  aliasOf?: StudioKey;
  description: string;
};

const HIT_FIELDS =
  "Keep JSON field names title, url, snippet, published_at, source_domain. Public HTML only. No login.";

export const COLLECTOR_SPECS: CollectorSpec[] = [
  {
    key: "search",
    env: "TINGLE_C_SEARCH",
    family: "search",
    type: "Discovery",
    name: "tingle-search-devto",
    url: "https://dev.to/t/indiehackers",
    description: `Scraper type: Discovery. Listing of public posts tagged indiehackers. ${HIT_FIELDS}`,
  },
  {
    key: "watch",
    env: "TINGLE_C_WATCH",
    family: "watch",
    type: "Discovery",
    name: "tingle-watch-uneed",
    url: "https://www.uneed.best/",
    country: "US",
    region: "us",
    description: `Scraper type: Discovery. Current launches listing. ${HIT_FIELDS}`,
  },
  {
    key: "chaos",
    env: "TINGLE_C_CHAOS",
    family: "chaos",
    type: "Discovery",
    name: "tingle-chaos",
    url: "https://arjun7n9s.github.io/Tingle/fixtures/tingle-chaos/",
    description: `Scraper type: Discovery. Chaos fixture listing. ${HIT_FIELDS}`,
  },
  {
    key: "patent",
    env: "TINGLE_C_PATENT",
    family: "patent",
    type: "Search",
    name: "tingle-patent-google",
    url: "https://patents.google.com/",
    description: `Scraper type: Search. Google Patents result cards (US / EP / WO / national filings Google indexed, plus cited prior art when shown). ${HIT_FIELDS}`,
  },
  {
    key: "patent_uspto",
    env: "TINGLE_C_PATENT_USPTO",
    family: "patent",
    type: "Search",
    name: "tingle-patent-uspto",
    url: "https://www.uspto.gov/web/patents/patog/",
    country: "US",
    office: "uspto",
    description: `Scraper type: Search. USPTO Official Gazette / public search result cards. ${HIT_FIELDS}`,
  },
  {
    key: "patent_epo",
    env: "TINGLE_C_PATENT_EPO",
    family: "patent",
    type: "Search",
    name: "tingle-patent-epo",
    url: "https://worldwide.espacenet.com/patent/search",
    country: "EP",
    office: "epo",
    description: `Scraper type: Search. Espacenet result cards. ${HIT_FIELDS}`,
  },
  {
    key: "patent_wipo",
    env: "TINGLE_C_PATENT_WIPO",
    family: "patent",
    type: "Search",
    name: "tingle-patent-wipo",
    url: "https://patentscope.wipo.int/search/en/search.jsf",
    office: "wipo",
    description: `Scraper type: Search. PATENTSCOPE result cards. ${HIT_FIELDS}`,
  },
  {
    key: "patent_jpo",
    env: "TINGLE_C_PATENT_JPO",
    family: "patent",
    type: "Search",
    name: "tingle-patent-jpo",
    url: "https://www.j-platpat.inpit.go.jp/",
    country: "JP",
    office: "jpo",
    description: `Scraper type: Search. J-PlatPat result cards. ${HIT_FIELDS}`,
  },
  {
    key: "patent_kipo",
    env: "TINGLE_C_PATENT_KIPO",
    family: "patent",
    type: "Search",
    name: "tingle-patent-kipo",
    url: "http://eng.kipris.or.kr/",
    country: "KR",
    office: "kipo",
    description: `Scraper type: Search. KIPRIS English result cards. ${HIT_FIELDS}`,
  },
  {
    key: "patent_cnipa",
    env: "TINGLE_C_PATENT_CNIPA",
    family: "patent",
    type: "Search",
    name: "tingle-patent-cnipa",
    url: "http://epub.cnipa.gov.cn/",
    country: "CN",
    office: "cnipa",
    description: `Scraper type: Search. CNIPA publication result cards. ${HIT_FIELDS}`,
  },
  {
    key: "patent_ipos",
    env: "TINGLE_C_PATENT_IPOS",
    family: "patent",
    type: "Search",
    name: "tingle-patent-ipos",
    url: "https://www.ip2.sg/RPS/WP/CM/SearchSimpleP.aspx",
    country: "SG",
    office: "ipos",
    description: `Scraper type: Search. IPOS public search result cards. ${HIT_FIELDS}`,
  },
  {
    key: "patent_rospatent",
    env: "TINGLE_C_PATENT_ROSPATENT",
    family: "patent",
    type: "Search",
    name: "tingle-patent-rospatent",
    url: "https://www1.fips.ru/registers-web/",
    country: "RU",
    office: "rospatent",
    description: `Scraper type: Search. FIPS / ROSPATENT register result cards. ${HIT_FIELDS}`,
  },
  {
    key: "region_us",
    env: "TINGLE_C_REGION_US",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-us",
    url: "https://www.uneed.best/",
    country: "US",
    region: "us",
    aliasOf: "watch",
    description: "Alias of Watch (Uneed). Do not create a second collector.",
  },
  {
    key: "region_eu",
    env: "TINGLE_C_REGION_EU",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-eu",
    url: "https://www.eu-startups.com/",
    country: "DE",
    region: "eu",
    description: `Scraper type: Discovery. EU startup launch/news listing. ${HIT_FIELDS}`,
  },
  {
    key: "region_jp",
    env: "TINGLE_C_REGION_JP",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-jp",
    url: "https://www.j-startup.go.jp/en/startups/",
    country: "JP",
    region: "jp",
    description: `Scraper type: Discovery. J-Startup public catalog listing. ${HIT_FIELDS}`,
  },
  {
    key: "region_kr",
    env: "TINGLE_C_REGION_KR",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-kr",
    url: "https://www.venturesquare.net/",
    country: "KR",
    region: "kr",
    description: `Scraper type: Discovery. Korean startup listing. ${HIT_FIELDS}`,
  },
  {
    key: "region_cn",
    env: "TINGLE_C_REGION_CN",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-cn",
    url: "https://www.36kr.com/newsflashes",
    country: "CN",
    region: "cn",
    description: `Scraper type: Discovery. 36Kr newsflash listing. ${HIT_FIELDS}`,
  },
  {
    key: "region_sg",
    env: "TINGLE_C_REGION_SG",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-sg",
    url: "https://e27.co/",
    country: "SG",
    region: "sg",
    description: `Scraper type: Discovery. e27 SEA listing. ${HIT_FIELDS}`,
  },
  {
    key: "region_in",
    env: "TINGLE_C_REGION_IN",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-in",
    url: "https://inc42.com/buzz/",
    country: "IN",
    region: "in",
    description: `Scraper type: Discovery. Inc42 buzz listing. ${HIT_FIELDS}`,
  },
  {
    key: "region_ru",
    env: "TINGLE_C_REGION_RU",
    family: "regional",
    type: "Discovery",
    name: "tingle-region-ru",
    url: "https://vc.ru/",
    country: "RU",
    region: "ru",
    description: `Scraper type: Discovery. vc.ru public listing. ${HIT_FIELDS}`,
  },
];

export const COLLECTOR_BY_KEY: Record<CollectorKey, CollectorSpec> = Object.fromEntries(
  COLLECTOR_SPECS.map((s) => [s.key, s]),
) as Record<CollectorKey, CollectorSpec>;

const EU = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "NO",
]);

export function regionForCountry(country: string): RegionKey {
  const c = country.trim().toUpperCase();
  if (c === "JP") return "region_jp";
  if (c === "KR") return "region_kr";
  if (c === "CN" || c === "TW" || c === "HK") return "region_cn";
  if (c === "SG" || c === "MY" || c === "ID" || c === "TH" || c === "VN" || c === "PH") {
    return "region_sg";
  }
  if (c === "IN") return "region_in";
  if (c === "RU" || c === "BY" || c === "KZ") return "region_ru";
  if (EU.has(c)) return "region_eu";
  return "region_us";
}

export function homePatentForCountry(country: string): PatentKey {
  const c = country.trim().toUpperCase();
  if (c === "JP") return "patent_jpo";
  if (c === "KR") return "patent_kipo";
  if (c === "CN" || c === "TW") return "patent_cnipa";
  if (c === "SG") return "patent_ipos";
  if (c === "RU" || c === "BY") return "patent_rospatent";
  if (EU.has(c) || c === "GB" || c === "EP") return "patent_epo";
  return "patent_uspto";
}

export function familyOf(key: CollectorKey): HitFamily {
  return COLLECTOR_BY_KEY[key].family;
}

export function isCollectorKey(raw: string): raw is CollectorKey {
  return raw in COLLECTOR_BY_KEY;
}

export function googlePatentsUrl(query: string): string {
  const q = encodeURIComponent(query.slice(0, 180));
  return `https://patents.google.com/?q=${q}&oq=${q}`;
}

export function patentSearchUrl(office: string, query: string): string {
  const q = encodeURIComponent(query.slice(0, 180));
  switch (office) {
    case "uspto":
      return `https://ppubs.uspto.gov/pubwebapp/static/pages/ppubsbasic.html#q=${q}`;
    case "epo":
      return `https://worldwide.espacenet.com/patent/search?q=${q}`;
    case "wipo":
      return `https://patentscope.wipo.int/search/en/result.jsf?query=${q}`;
    case "jpo":
      return `https://www.j-platpat.inpit.go.jp/`;
    case "kipo":
      return `http://eng.kipris.or.kr/`;
    case "cnipa":
      return `http://epub.cnipa.gov.cn/`;
    case "ipos":
      return `https://www.ip2.sg/RPS/WP/CM/SearchSimpleP.aspx`;
    case "rospatent":
      return `https://www1.fips.ru/registers-web/`;
    default:
      return `https://patentscope.wipo.int/search/en/result.jsf?query=${q}`;
  }
}

export type LaneJob = {
  key: CollectorKey;
  family: HitFamily;
  url: string;
  region?: string;
  office?: string;
  home: boolean;
};

export type LanePlan = {
  country: string;
  region: RegionKey;
  homePatent: PatentKey;
  jobs: LaneJob[];
  missing: { key: CollectorKey; reason: string }[];
};

function pinnedId(
  key: CollectorKey,
  collectors: Partial<Record<CollectorKey, string>>,
): string | undefined {
  const spec = COLLECTOR_BY_KEY[key];
  if (spec.aliasOf) return collectors[spec.aliasOf] ?? collectors[key];
  return collectors[key];
}

function pushJob(
  jobs: LaneJob[],
  seen: Set<string>,
  job: LaneJob,
): void {
  const sig = `${job.key}|${job.url}`;
  if (seen.has(sig)) return;
  seen.add(sig);
  jobs.push(job);
}

/**
 * Cheap: search + home board + Google Patents.
 * Deep: + two foreign boards. USPTO JSON is an adjunct, not a fourth Studio pin.
 * Per-office Studio collectors stay in COLLECTOR_SPECS for later; they are not planned.
 * Missing pins are recorded, not treated as empty niches.
 */
export function planLanes(opts: {
  country?: string;
  lane: "cheap" | "deep";
  collectors: Partial<Record<CollectorKey, string>>;
  searchListingUrl: string;
  watchUrl: string;
  query: string;
}): LanePlan {
  const country = (opts.country ?? "US").trim().toUpperCase() || "US";
  const region = regionForCountry(country);
  const homePatent = homePatentForCountry(country);
  const missing: LanePlan["missing"] = [];
  const jobs: LaneJob[] = [];
  const seen = new Set<string>();

  const want = (key: CollectorKey, url: string, home: boolean) => {
    const spec = COLLECTOR_BY_KEY[key];
    if (!pinnedId(key, opts.collectors)) {
      missing.push({
        key,
        reason: `${spec.env} not pinned — ${spec.family} lane skipped, not an empty niche`,
      });
      return;
    }
    pushJob(jobs, seen, {
      key: spec.aliasOf ?? key,
      family: spec.family === "regional" && spec.aliasOf ? "watch" : spec.family,
      url,
      region: spec.region,
      office: spec.office,
      home,
    });
  };

  want("search", opts.searchListingUrl, true);

  const homeSpec = COLLECTOR_BY_KEY[region];
  const homeUrl =
    region === "region_us" ? opts.watchUrl : homeSpec.url;
  want(region, homeUrl, true);

  want("patent", googlePatentsUrl(opts.query), true);

  if (opts.lane === "deep") {
    const foreign = REGION_KEYS.filter((k) => k !== region).slice(0, 2);
    for (const k of foreign) {
      const spec = COLLECTOR_BY_KEY[k];
      const url = k === "region_us" ? opts.watchUrl : spec.url;
      want(k, url, false);
    }
  }

  return { country, region, homePatent, jobs, missing };
}
