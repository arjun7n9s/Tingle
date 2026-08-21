export type CollectorKey = "search" | "watch" | "chaos";

export type TingleConfig = {
  /** Bright Data API token. Empty string => mock mode. */
  apiToken: string;
  /** Pinned Scraper Studio collector ids. Never re-create a populated one. */
  collectors: Partial<Record<CollectorKey, string>>;
  /** Long-tail Discovery/Sitemap target for the watch collector. */
  watchUrl?: string;
  /** Public chaos fixture URL (must be reachable by Bright Data). */
  chaosUrl?: string;
  /**
   * If the search collector was created against a search-results URL, this
   * template carries the keyword. `{q}` is replaced with the URL-encoded
   * claim. When unset we send `{ keyword, country }` instead.
   */
  searchUrlTemplate?: string;
  searchCountry?: string;
  /** Claim used as the search keyword by prove:tingle-live. */
  sampleClaim: string;
  /** Run the full state machine on fixtures — no token, no credits. */
  mock: boolean;
  baseUrl: string;
};

/**
 * The Bright Data CLI reads BRIGHTDATA_API_KEY; this repo has historically used
 * BRIGHT_DATA_API_TOKEN. Accept either so one login serves both.
 */
function readToken(env: NodeJS.ProcessEnv): string {
  return (
    env.BRIGHT_DATA_API_TOKEN?.trim() ||
    env.BRIGHTDATA_API_KEY?.trim() ||
    ""
  );
}

export function loadTingleConfig(
  env: NodeJS.ProcessEnv = process.env,
): TingleConfig {
  const apiToken = readToken(env);
  return {
    apiToken,
    collectors: {
      search: placeholderToUndefined(env.TINGLE_C_SEARCH),
      watch: placeholderToUndefined(env.TINGLE_C_WATCH),
      chaos: placeholderToUndefined(env.TINGLE_C_CHAOS),
    },
    watchUrl: env.TINGLE_WATCH_URL?.trim() || undefined,
    chaosUrl: env.TINGLE_CHAOS_URL?.trim() || undefined,
    searchUrlTemplate: env.TINGLE_SEARCH_URL_TEMPLATE?.trim() || undefined,
    searchCountry: env.TINGLE_SEARCH_COUNTRY?.trim() || undefined,
    sampleClaim:
      env.TINGLE_SAMPLE_CLAIM?.trim() ||
      "a watch that tells indie builders when someone else ships their idea",
    mock: env.TINGLE_MOCK === "1" || !apiToken,
    baseUrl: env.BRIGHT_DATA_API_BASE?.trim() || "https://api.brightdata.com",
  };
}

/**
 * `.env.example` ships `c_xxxxxxxx` placeholders. Treating those as real ids
 * would produce confusing 404s from Bright Data, so drop them.
 */
function placeholderToUndefined(raw?: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (/^c_x+$/i.test(v)) return undefined;
  return v;
}
