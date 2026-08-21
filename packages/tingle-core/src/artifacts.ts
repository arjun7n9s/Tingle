import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Repo root, given the directory of a file in
 * `packages/tingle-core/{src,dist}/scripts/`. Same depth either way, so it
 * works for `tsx` on source and for the compiled output.
 */
export function repoRootFromScripts(scriptsDir: string): string {
  return path.resolve(scriptsDir, "../../../..");
}

/**
 * Write a proof artifact.
 *
 * The `mode` stamp is not decoration: a mock run and a live run produce the
 * same shape, and an unstamped file is indistinguishable from real evidence
 * that a collector works.
 */
export async function writeArtifact(
  dir: string,
  prefix: string,
  payload: Record<string, unknown> & { mode: "mock" | "live" },
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${prefix}-${payload.mode}-${stamp}.json`);
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

/**
 * Strip anything token-shaped before an artifact hits disk. Collector ids are
 * not secrets; bearer tokens and API keys are.
 */
export function redact<T>(value: T): T {
  const json = JSON.stringify(value, (key, v) => {
    if (typeof v !== "string") return v;
    if (/^(authorization|api[-_]?key|token|password)$/i.test(key)) {
      return "[redacted]";
    }
    return v.replace(/Bearer\s+[A-Za-z0-9._~+/-]{12,}=*/g, "Bearer [redacted]");
  });
  return JSON.parse(json) as T;
}
