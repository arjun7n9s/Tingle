import dotenv from "dotenv";
import path from "node:path";
import {
  COLLECTOR_SPECS,
  COLLECTOR_BY_KEY,
  familyOf,
  isCollectorKey,
  type CollectorKey,
} from "./collectors.js";
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
  publicUrl: string;
  appUrl: string;
  githubOAuth: { clientId: string; clientSecret: string };
  googleOAuth: { clientId: string; clientSecret: string };
  /** Dataset Marketplace ids. Empty = skip, never invent. Deep lane only. */
  datasets: {
    chatgpt?: string;
    aiMode?: string;
    firehose?: string;
  };
  /** Optional OpenAI-compatible chat. Missing key => deterministic assembler. */
  llm?: { apiKey: string; model: string; url: string };
  /**
   * Bright Data SERP zone name. Adjunct URL discovery only.
   * Empty / mock => skip. Landing pages still go through Watch {url}.
   */
  serpZone?: string;
  /**
   * Token for the SERP zone. Defaults to apiToken. Set TINGLE_PREMIUM_API_TOKEN
   * (or TINGLE_SERP_TOKEN) when the SERP zone lives on a second Bright Data
   * account. Never reuse this as the Studio collector token.
   */
  serpToken?: string;
  /**
   * Bright Data Web Unlocker zone for public patent/paper detail URLs.
   * Empty = skip, never a crash. First look / ticks fetch a capped set of
   * listing detail pages only — not a replacement for the Search collector.
   */
  unlockerZone?: string;
  /** Token for the Unlocker zone. Defaults to apiToken. */
  unlockerToken?: string;
  /**
   * Second-account Unlocker zone (e.g. web_unlocker_api). Used only for
   * patent/paper detail fetches. Studio and cli_unlocker stay on account 1.
   */
  premiumUnlockerZone?: string;
  /** Default 0.6. Patent rows at or above this lexical/LLM overlap go on patent_threats. */
  patentOverlapMin: number;
  /**
   * Scraping Browser (CDP) credentials. Unused until a host needs them
   * (e.g. J-PlatPat). Never mixed into Studio or Unlocker calls.
   */
  browserApi?: { username: string; password: string };
  /** Generic JSON webhook for Now/digest events. Empty = skip. */
  webhookUrl?: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
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
    collectors: loadCollectorPins(env),
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
    publicUrl: (
      env.TINGLE_PUBLIC_URL?.trim() || "http://localhost:3000/tingle-api"
    ).replace(/\/$/, ""),
    appUrl: (
      env.TINGLE_APP_URL?.trim() || "http://localhost:3000/tingle"
    ).replace(/\/$/, ""),
    githubOAuth: {
      clientId: env.GITHUB_OAUTH_CLIENT_ID?.trim() || "",
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET?.trim() || "",
    },
    googleOAuth: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "",
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "",
    },
    datasets: datasetIds(env),
    llm: readLlm(env),
    serpZone:
      env.TINGLE_SERP_ZONE?.trim() ||
      env.BRIGHT_DATA_SERP_ZONE?.trim() ||
      undefined,
    serpToken:
      env.TINGLE_SERP_TOKEN?.trim() ||
      env.TINGLE_PREMIUM_API_TOKEN?.trim() ||
      undefined,
    unlockerZone:
      env.TINGLE_UNLOCKER_ZONE?.trim() ||
      env.TINGLE_UNLOCKER_ZONE?.trim() ||
      undefined,
    unlockerToken:
      env.TINGLE_UNLOCKER_TOKEN?.trim() ||
      env.TINGLE_PREMIUM_UNLOCKER_TOKEN?.trim() ||
      undefined,
    premiumUnlockerZone:
      env.TINGLE_PREMIUM_UNLOCKER_ZONE?.trim() || undefined,
    patentOverlapMin: Number(env.TINGLE_PATENT_OVERLAP_MIN) || 0.6,
    browserApi: readBrowserApi(env),
    webhookUrl: env.TINGLE_WEBHOOK_URL?.trim() || undefined,
    slackWebhookUrl: env.TINGLE_SLACK_WEBHOOK_URL?.trim() || undefined,
    discordWebhookUrl: env.TINGLE_DISCORD_WEBHOOK_URL?.trim() || undefined,
  };
}

function readLlm(
  env: NodeJS.ProcessEnv,
): TingleConfig["llm"] | undefined {
  const aimlKey =
    env.AIMLAPI_KEY?.trim() ||
    env.AIML_API_KEY?.trim() ||
    env.aimlapi_key?.trim() ||
    env["aimlapi-key"]?.trim() ||
    "";
  const apiKey =
    env.TINGLE_LLM_KEY?.trim() ||
    aimlKey ||
    env.OPENAI_API_KEY?.trim() ||
    "";
  if (!apiKey) return undefined;
  const viaAiml = Boolean(aimlKey) && apiKey === aimlKey;
  return {
    apiKey,
    model: env.TINGLE_LLM_MODEL?.trim() || (viaAiml ? "gpt-4o" : "gpt-4o-mini"),
    url:
      env.TINGLE_LLM_URL?.trim() ||
      (viaAiml
        ? "https://api.aimlapi.com/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions"),
  };
}

function readBrowserApi(
  env: NodeJS.ProcessEnv,
): TingleConfig["browserApi"] | undefined {
  const username =
    env.TINGLE_BROWSER_API_USER?.trim() ||
    env.TINGLE_BROWSER_API_USERNAME?.trim() ||
    "";
  const password = env.TINGLE_BROWSER_API_PASSWORD?.trim() || "";
  if (!username || !password) return undefined;
  return { username, password };
}

function datasetIds(env: NodeJS.ProcessEnv): TingleConfig["datasets"] {
  if (env.TINGLE_MARKETPLACE === "0") return {};
  return {
    chatgpt:
      placeholderToUndefined(env.TINGLE_DATASET_CHATGPT) ||
      "gd_m7aof0k82r803d5bjm",
    aiMode:
      placeholderToUndefined(env.TINGLE_DATASET_AI_MODE) ||
      "gd_mcswdt6z2elth3zqr2",
    firehose: placeholderToUndefined(env.TINGLE_FIREHOSE_DATASET),
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

function loadCollectorPins(
  env: NodeJS.ProcessEnv,
): Partial<Record<CollectorKey, string>> {
  const pins: Partial<Record<CollectorKey, string>> = {};
  for (const spec of COLLECTOR_SPECS) {
    const id = placeholderToUndefined(env[spec.env]);
    if (id) pins[spec.key] = id;
  }
  const mock = env.TINGLE_MOCK === "1" || !readToken(env);
  if (mock) {
    for (const key of ["search", "watch", "chaos"] as const) {
      if (!pins[key]) pins[key] = `mock_${key}`;
    }
  }
  if (!pins.region_us && pins.watch) pins.region_us = pins.watch;
  return pins;
}

/** Discovery collectors take `{url}`. Search listing never `{q}`. Patent Search URLs may include a compiled query. */
export function triggerInputs(
  key: CollectorKey,
  config: TingleConfig,
  urlOverride?: string,
): { url: string }[] {
  if (urlOverride) return [{ url: urlOverride }];
  if (key === "search") return [{ url: config.searchListingUrl }];
  if (key === "watch" || key === "region_us") return [{ url: config.watchUrl }];
  if (key === "chaos") return [{ url: config.chaosUrl }];
  const spec = COLLECTOR_BY_KEY[key];
  return [{ url: spec.url }];
}

export function chaosBrokenUrl(config: TingleConfig): string {
  return config.chaosBrokenUrl;
}

export function requirePinned(
  config: TingleConfig,
  key: CollectorKey,
): string {
  const spec = isCollectorKey(key) ? COLLECTOR_BY_KEY[key] : undefined;
  const id = config.collectors[key] ?? (spec?.aliasOf ? config.collectors[spec.aliasOf] : undefined);
  if (!id) {
    const envName = spec?.env ?? `TINGLE_C_${key.toUpperCase()}`;
    throw new Error(
      `${envName} is not pinned. Create once, then paste the c_* into .env — do not create again.`,
    );
  }
  return id;
}

export { familyOf };
