import fs from "node:fs/promises";
import path from "node:path";
import { tingleDataDir } from "../paths.js";
import type { PileHit } from "../piles.js";
import { isVaultBlob, masterKey, open, seal } from "../vault.js";

export type Baseline = {
  project_id: string;
  at: string;
  hit_ids: string[];
  urls: string[];
  content_hashes: string[];
};

function fileFor(projectId: string): string {
  return path.join(tingleDataDir(), "baselines", `${projectId}.json`);
}

export async function loadBaseline(projectId: string): Promise<Baseline | undefined> {
  try {
    const raw = await fs.readFile(fileFor(projectId), "utf8");
    const trimmed = raw.trim();
    if (isVaultBlob(trimmed)) return open<Baseline>(masterKey(), trimmed);
    return JSON.parse(raw) as Baseline;
  } catch {
    return undefined;
  }
}

export async function saveBaseline(baseline: Baseline): Promise<void> {
  const file = fileFor(baseline.project_id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, seal(masterKey(), baseline), "utf8");
}

export async function removeBaseline(projectId: string): Promise<void> {
  await fs.unlink(fileFor(projectId)).catch(() => undefined);
}

export function baselineFromHits(projectId: string, hits: PileHit[]): Baseline {
  return {
    project_id: projectId,
    at: new Date().toISOString(),
    hit_ids: hits.map((h) => h.id),
    urls: hits.map((h) => h.url),
    content_hashes: hits.map((h) => h.content_hash),
  };
}

export function mergeBaseline(prev: Baseline, hits: PileHit[]): Baseline {
  const ids = new Set(prev.hit_ids);
  const urls = new Set(prev.urls);
  const hashes = new Set(prev.content_hashes);
  for (const h of hits) {
    ids.add(h.id);
    urls.add(h.url);
    hashes.add(h.content_hash);
  }
  return {
    project_id: prev.project_id,
    at: new Date().toISOString(),
    hit_ids: [...ids],
    urls: [...urls],
    content_hashes: [...hashes],
  };
}

/** A hit is new if we have not seen this URL *or* this page content before. */
export function isNewVersusBaseline(hit: PileHit, baseline: Baseline): boolean {
  return !baseline.urls.includes(hit.url) && !baseline.content_hashes.includes(hit.content_hash);
}
