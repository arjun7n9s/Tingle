import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BrightDataClient } from "../bd/client.js";
import {
  loadEnv,
  loadTingleConfig,
  readToken,
  type CollectorKey,
} from "../config.js";
import { repoRoot } from "../paths.js";

/**
 * Create pinned Studio collectors once. Refuses if TINGLE_C_* is already set
 * or if a scraper with that --name already exists on the account.
 *
 * AI-Flow 403 ("Automation not allowed") is an account permission issue, not a
 * bad URL. Do not create-spam stubs. Finish the half-built collector in Studio
 * or get AI-Flow enabled, then resume this script.
 */

loadEnv();
const config = loadTingleConfig();
const token = readToken();
if (!token) {
  console.error("No Bright Data token. Set BRIGHT_DATA_API_TOKEN.");
  process.exit(1);
}

const TARGETS: {
  key: CollectorKey;
  name: string;
  url: string;
  description: string;
}[] = [
  {
    key: "search",
    name: "tingle-search-devto",
    url: config.searchListingUrl,
    description:
      "Scraper type: Discovery. Listing of public posts tagged indiehackers. Server-rendered story cards. Extract each story: title, url (article permalink), snippet (subtitle or first line), published_at if shown else null, source_domain dev.to. Do not scrape /search. Public HTML only. Keep field names title, url, snippet, published_at, source_domain.",
  },
  {
    key: "watch",
    name: "tingle-watch-uneed",
    url: config.watchUrl,
    description:
      "Scraper type: Discovery. Extract each product on the current launches listing: title, url (product page), snippet (tagline), published_at (launch date if shown, else today's date for launching today rows), source_domain uneed.best. Public pages only. Keep JSON field names title, url, snippet, published_at, source_domain.",
  },
  {
    key: "chaos",
    name: "tingle-chaos",
    url: config.chaosUrl,
    description:
      "Scraper type: Discovery. Public launch-board listing. Each article.hit-card is one row. Extract title from .claim-title, url from a.hit href, snippet from .hit-snippet, published_at from .hit-date datetime, source_domain from the url host. Keep JSON field names title, url, snippet, published_at, source_domain. Public HTML only. No login.",
  },
];

const only = process.argv.find((a, i) => process.argv[i - 1] === "--only") as
  | CollectorKey
  | undefined;
const force = process.argv.includes("--force");

const client = new BrightDataClient({ ...config, mock: false, apiToken: token });
const existing = await client.listCollectors().catch((err) => {
  console.error("list collectors failed", err);
  return [];
});

for (const target of TARGETS) {
  if (only && target.key !== only) continue;

  const pinned = config.collectors[target.key];
  if (pinned && !force) {
    console.log(`skip ${target.key}: already pinned ${pinned}`);
    continue;
  }

  const found = existing.find((c) => c.name === target.name);
  if (found && !force) {
    console.log(
      `skip ${target.key}: collector named ${target.name} already exists (${found.id}, status=${found.status ?? "?"}). Pin it in .env instead of creating again.`,
    );
    pinEnv(target.key, found.id);
    continue;
  }

  console.log(`creating ${target.name} against ${target.url} …`);
  const code = await runCreate(target.url, target.description, target.name);
  if (code !== 0) {
    console.error(
      `create ${target.name} failed (${code}). If this was 403 Automation not allowed, stop — do not create more stubs. Bright Data must enable Scraper Studio AI-Flow.`,
    );
    process.exit(code);
  }
}

function pinEnv(key: CollectorKey, id: string) {
  const envPath = path.join(repoRoot(), ".env");
  let text = readFileSync(envPath, "utf8");
  const re = new RegExp(`^TINGLE_C_${key.toUpperCase()}=.*$`, "m");
  const line = `TINGLE_C_${key.toUpperCase()}=${id}`;
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, text, "utf8");
  console.log(`pinned ${line} in .env`);
}

function runCreate(url: string, description: string, name: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "-p",
        "@brightdata/cli",
        "bdata",
        "scraper",
        "create",
        url,
        description.slice(0, 500),
        "--name",
        name,
        "--timeout",
        "1500",
        "--json",
      ],
      {
        cwd: repoRoot(),
        env: { ...process.env, BRIGHTDATA_API_KEY: token },
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
