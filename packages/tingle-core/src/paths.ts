import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root whether this file is loaded from `src/` or `dist/`. */
export function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** Override with TINGLE_DATA_DIR so prove scripts do not touch the local UI db. */
export function tingleDataDir(): string {
  return process.env.TINGLE_DATA_DIR?.trim() || path.join(repoRoot(), ".data", "tingle");
}
