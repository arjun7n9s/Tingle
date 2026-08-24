import { Buffer } from "node:buffer";
import type { TingleConfig } from "../config.js";
import { fetchT } from "../edge/fetchT.js";
import { BrightDataError } from "./client.js";

const UNLOCKER_PATH = "/request";
const TIMEOUT_MS = 20_000;
const MAX_MARKDOWN_CHARS = 20_000;

/** Returned in mock mode; mock never opens a network connection or spends credits. */
export const MOCK_UNLOCKER_MARKDOWN = `# Example patent detail

This is a deterministic Web Unlocker fixture for a public patent or paper detail page.
`;

/** Mock listing page. Used when Unlocker is asked for a Google Patents search URL. */
export const MOCK_UNLOCKER_LISTING_MARKDOWN = `# Google Patents

[Haptic wearable alert](https://patents.google.com/patent/US20140142851A1)
A watch that vibrates when a nearby claim ships.

[Swarm robot coordination](https://patents.google.com/patent/US8123456B2)
Public filing abstract for collaborative robots.
`;

export type UnlockerMarkdown = {
  markdown: string;
  /** Target response status when Unlocker provides one; otherwise the API status. */
  status: number;
  /** UTF-8 bytes in the returned, truncated markdown. */
  bytes: number;
};

export type UnlockerSkipped = {
  skipped: true;
  reason: "missing_unlocker_zone" | "missing_api_token";
};

export type UnlockerResult = UnlockerMarkdown | UnlockerSkipped;

export type UnlockerOptions = {
  /** Optional two-letter ISO 3166-1 proxy location. Omit to use zone defaults. */
  country?: string;
  /** Override zone (second-account Unlocker). Never used for Studio. */
  zone?: string;
  /** Override token (second-account Unlocker). */
  token?: string;
};

/**
 * Fetch one public HTTPS page through Bright Data Web Unlocker as markdown.
 * Used for Google Patents listing URLs when Studio cannot crawl them, and for
 * a capped set of patent detail URLs after cards exist. Missing zone skips.
 */
export async function fetchUnlockerMarkdown(
  config: TingleConfig,
  url: string,
  options: UnlockerOptions = {},
): Promise<UnlockerResult> {
  const target = publicHttpsUrl(url);
  const country = normalizeCountry(options.country);

  // A missing zone is configuration, not a transport failure. Do not attempt
  // a request against an implicit/default zone.
  const zone = options.zone || config.unlockerZone;
  if (!zone) {
    return { skipped: true, reason: "missing_unlocker_zone" };
  }

  // Tingle's default mock path still produces shaped page content so callers
  // can exercise their normalizer and Zod gate without credits.
  if (config.mock) {
    const listing = /patents\.google\.com/i.test(target.toString()) &&
      !/\/patent\//i.test(target.pathname);
    return markdownResult(
      listing ? MOCK_UNLOCKER_LISTING_MARKDOWN : MOCK_UNLOCKER_MARKDOWN,
      200,
    );
  }

  const token = options.token || config.unlockerToken || config.apiToken;
  if (!token) {
    return { skipped: true, reason: "missing_api_token" };
  }

  let res: Response;
  try {
    res = await fetchT(
      new URL(UNLOCKER_PATH, config.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/markdown, text/plain, application/json",
        },
        body: JSON.stringify({
          zone,
          url: target.toString(),
          format: "raw",
          data_format: "markdown",
          ...(country ? { country } : {}),
        }),
      },
      TIMEOUT_MS,
    );
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new BrightDataError("Web Unlocker request timed out", 408);
    }
    throw err;
  }

  const text = await res.text();
  if (!res.ok) {
    throw new BrightDataError("Web Unlocker request failed", res.status);
  }

  const parsed = responseContent(text, res.headers.get("content-type"));
  return markdownResult(parsed.markdown, parsed.status ?? res.status);
}

function markdownResult(markdown: string, status: number): UnlockerMarkdown {
  const clipped = markdown.slice(0, MAX_MARKDOWN_CHARS);
  return {
    markdown: clipped,
    status,
    bytes: Buffer.byteLength(clipped, "utf8"),
  };
}

/** Bright Data can return either raw content or a JSON response envelope. */
function responseContent(
  text: string,
  contentType: string | null,
): { markdown: string; status?: number } {
  if (!contentType?.toLowerCase().includes("application/json")) {
    return { markdown: text };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "string") return { markdown: parsed };
    if (parsed && typeof parsed === "object") {
      const envelope = parsed as { body?: unknown; status_code?: unknown };
      const status =
        typeof envelope.status_code === "number"
          ? envelope.status_code
          : undefined;
      if (typeof envelope.body === "string") {
        return { markdown: envelope.body, status };
      }
    }
  } catch {
    // A proxy can mislabel content. Preserve it rather than discarding it.
  }
  return { markdown: text };
}

function publicHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError("Web Unlocker only accepts an absolute public HTTPS URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    isPrivateHost(url.hostname)
  ) {
    throw new TypeError("Web Unlocker only accepts a public HTTPS URL");
  }
  return url;
}

function isPrivateHost(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  if (normalized === "::1" || normalized === "::") return true;

  const octets = normalized.split(".");
  if (octets.length !== 4 || octets.some((v) => !/^\d+$/.test(v))) return false;
  const numbers = octets.map(Number);
  if (numbers.some((v) => v > 255)) return true;
  const [a, b] = numbers;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function normalizeCountry(country: string | undefined): string | undefined {
  if (!country) return undefined;
  const normalized = country.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    throw new TypeError("Unlocker country must be a two-letter ISO country code");
  }
  return normalized;
}
