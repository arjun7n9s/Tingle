import fs from "node:fs/promises";
import path from "node:path";
import { parseGithubRepo } from "./claim.js";
import { tingleDataDir } from "./paths.js";
import type { Baseline } from "./jobs/baseline.js";
import type { TingleEvent } from "./schema/events.js";
import type { WatchProfile } from "./schema/profile.js";

export const TINGLE_TREE = ".tingle";

export const GITHUB_STORAGE_COPY =
  "Your pitch never sits in our database as a product dataset. The canonical watch lives in .tingle/ on your private repo. We still see the claim while a job runs.";

export type GithubRepoRef = { owner: string; repo: string };

export type GithubTarget = {
  owner: string;
  repo: string;
  token: string;
  mock: boolean;
};

export type TingleTreeSnapshot = {
  profile: WatchProfile;
  baseline?: Baseline;
  events: TingleEvent[];
  artifacts?: { pitch?: string; docs?: string };
  stealth?: boolean;
};

const UA = "Tingle/0.1 (.tingle-sync)";

export function parseGithubRepoRef(input: string): GithubRepoRef | undefined {
  const fromUrl = parseGithubRepo(input.trim());
  if (fromUrl) return fromUrl;
  const m = input.trim().match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return undefined;
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, "") };
}

export function githubMirrorRoot(ref: GithubRepoRef): string {
  return path.join(tingleDataDir(), "github-mirror", ref.owner, ref.repo);
}

/** JSON-compatible YAML 1.2 — valid as .yml without a YAML library. */
export function renderTingleFiles(
  snap: TingleTreeSnapshot,
): Record<string, string> {
  const files: Record<string, string> = {};
  const profile = {
    ...snap.profile,
    storage: "github",
  };
  files[`${TINGLE_TREE}/profile.yml`] = `${JSON.stringify(profile, null, 2)}\n`;
  files[`${TINGLE_TREE}/README.md`] = [
    "# .tingle/",
    "",
    "Canonical watch for this project. Same shape as Tingle's encrypted vault;",
    "this tree is the opt-in GitHub copy. See docs/tingle/format.md.",
    "",
  ].join("\n");
  if (snap.baseline) {
    files[`${TINGLE_TREE}/baseline.json`] =
      `${JSON.stringify(snap.baseline, null, 2)}\n`;
  }
  if (!snap.stealth && snap.artifacts?.pitch) {
    files[`${TINGLE_TREE}/artifacts/pitch.txt`] = snap.artifacts.pitch;
  }
  if (snap.artifacts?.docs) {
    files[`${TINGLE_TREE}/artifacts/docs.md`] = snap.artifacts.docs;
  }
  for (const ev of snap.events) {
    const stamp = ev.at.replace(/[:.]/g, "-");
    files[`${TINGLE_TREE}/events/${stamp}-${ev.id}.json`] =
      `${JSON.stringify(ev, null, 2)}\n`;
  }
  return files;
}

export async function syncTingleTree(
  target: GithubTarget,
  snap: TingleTreeSnapshot,
): Promise<{ paths: string[]; backend: "mock" | "github" }> {
  const files = renderTingleFiles(snap);
  if (target.mock || !target.token || target.token === "mock") {
    const root = githubMirrorRoot(target);
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(root, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, body, "utf8");
    }
    return { paths: Object.keys(files), backend: "mock" };
  }

  await assertPrivateRepo(target);
  for (const [rel, body] of Object.entries(files)) {
    await putGithubFile(target, rel, body);
  }
  return { paths: Object.keys(files), backend: "github" };
}

export async function readTingleProfile(
  target: GithubTarget,
): Promise<WatchProfile | undefined> {
  const rel = `${TINGLE_TREE}/profile.yml`;
  if (target.mock || !target.token || target.token === "mock") {
    try {
      const raw = await fs.readFile(
        path.join(githubMirrorRoot(target), rel),
        "utf8",
      );
      return JSON.parse(raw) as WatchProfile;
    } catch {
      return undefined;
    }
  }
  const raw = await getGithubFile(target, rel);
  if (!raw) return undefined;
  return JSON.parse(raw) as WatchProfile;
}

async function assertPrivateRepo(target: GithubTarget): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}`,
    { headers: githubHeaders(target.token) },
  );
  if (res.status === 404) {
    throw new Error("GitHub repo not found, or the token cannot see it");
  }
  if (!res.ok) throw new Error(`GitHub repo HTTP ${res.status}`);
  const body = (await res.json()) as { private?: boolean };
  if (!body.private) {
    throw new Error(
      "Keep this on my GitHub requires a private repo. A public tree would leak the claim.",
    );
  }
}

async function getGithubFile(
  target: GithubTarget,
  rel: string,
): Promise<string | undefined> {
  const res = await fetch(contentsUrl(target, rel), {
    headers: githubHeaders(target.token),
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GitHub read HTTP ${res.status}`);
  const body = (await res.json()) as { content?: string; encoding?: string };
  if (!body.content) return undefined;
  return Buffer.from(body.content, "base64").toString("utf8");
}

async function putGithubFile(
  target: GithubTarget,
  rel: string,
  body: string,
): Promise<void> {
  let sha: string | undefined;
  const existing = await fetch(contentsUrl(target, rel), {
    headers: githubHeaders(target.token),
  });
  if (existing.ok) {
    const row = (await existing.json()) as { sha?: string };
    sha = row.sha;
  }
  const res = await fetch(contentsUrl(target, rel), {
    method: "PUT",
    headers: {
      ...githubHeaders(target.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `tingle: sync ${rel}`,
      content: Buffer.from(body, "utf8").toString("base64"),
      sha,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write ${rel} HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
}

function contentsUrl(target: GithubTarget, rel: string): string {
  return `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${rel
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}
