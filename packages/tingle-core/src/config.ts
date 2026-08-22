import dotenv from "dotenv";
import path from "node:path";
import type { CollectorKey } from "./schema/hits.js";
import { repoRoot } from "./paths.js";

export type { CollectorKey };

export type TingleConfig = {
  /** Bright Data API token. Empty string => mock mode. */
  apiToken: string;
  /** Pinned Scraper Studio collector ids. Never re-create a populated one. */
  collectors: Partial<Record<CollectorKey, string>>;
  /** Fixed Discovery listing for Search. Not a `{q}` template. */
  searchListingUrl: string;
  /** Long-tail Discovery target for the watch collector. */
  watchUrl: string;
  /** Public chaos fixture URL (must be reachable by Bright Data). */
  chaosUrl: string;
  /** Redesigned chaos page used to trip Zod without swapping GitHub Pages. */
  chaosBrokenUrl: string;
  /** Claim used as the first-look sample by prove:tingle-live. */
  sampleClaim: string;
  /** Run the full state machine on fixtures — no token, no credits. */
  mock: boolean;
  baseUrl: string;
  apiPort: number;
  /** Optional USPTO Open Data Portal key. Adjunct only; never the proof path. */
  usptoApiKey?: string;
};

/**
 * The Bright Data CLI reads BRIGHTDATA_API_KEY; this repo has historically used
 * BRIGHT_DATA_API_TOKEN. Accept either so one login serves both.
 *
 * `*_2` wins when set — a second account/key for when the primary token cannot
 * run Scraper Studio AI-Flow.
 */
export function readToken(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.BRIGHT_DATA_API_TOKEN_2?.trim() ||
    env.BRIGHTDATA_API_KEY_2?.trim() ||
    env.BRIGHT_DATA_API_TOKEN?.trim() ||
    env.BRIGHTDATA_API_KEY?.trim() ||
    ""
  );
}

export function loadEnv(envPath?: string): void {
  dotenv.config({ path: envPath ?? path.join(repoRoot(), ".env") });
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
    searchListingUrl:
      env.TINGLE_SEARCH_URL?.trim() || "https://dev.to/t/indiehackers",
    watchUrl: env.TINGLE_WATCH_URL?.trim() || "https://www.uneed.best/",
    chaosUrl:
      env.TINGLE_CHAOS_URL?.trim() ||
      "https://arjun7n9s.github.io/Tingle/fixtures/tingle-chaos/",
    chaosBrokenUrl:
      env.TINGLE_CHAOS_BROKEN_URL?.trim() ||
      "https://gist.githubusercontent.com/arjun7n9s/7544217f851471df4a1e9f4141a18197/raw/broken.html",
    sampleClaim:
      env.TINGLE_SAMPLE_CLAIM?.trim() ||
      "a watch that tells indie builders when someone else ships their idea",
    mock: env.TINGLE_MOCK === "1" || !apiToken,
    baseUrl: env.BRIGHT_DATA_API_BASE?.trim() || "https://api.brightdata.com",
    apiPort: Number(env.TINGLE_API_PORT) || 8788,
    usptoApiKey:
      env.USPTO_ODP_API_KEY?.trim() || env.USPTO_API_KEY?.trim() || undefined,
  };
}

/**
 * `.env.example` ships `c_xxxxxxxx` placeholders. Treating those as real ids
 * would produce confusing 404s from Bright Data, so drop them.
 */
export function placeholderToUndefined(raw?: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (/^c_x+$/i.test(v)) return undefined;
  return v;
}

/** Discovery collectors take `{url}`. Search is a fixed listing — never `{q}`. */
export function triggerInputs(
  key: CollectorKey,
  config: TingleConfig,
  urlOverride?: string,
): { url: string }[] {
  if (urlOverride) return [{ url: urlOverride }];
  if (key === "search") return [{ url: config.searchListingUrl }];
  if (key === "watch") return [{ url: config.watchUrl }];
  return [{ url: config.chaosUrl }];
}

export function chaosBrokenUrl(config: TingleConfig): string {
  return config.chaosBrokenUrl;
}

export function requirePinned(
  config: TingleConfig,
  key: CollectorKey,
): string {
  const id = config.collectors[key];
  if (!id) {
    throw new Error(
      `TINGLE_C_${key.toUpperCase()} is not pinned. Create once, then paste the c_* into .env — do not create again.`,
    );
  }
  return id;
}
