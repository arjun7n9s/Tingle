import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { tingleDataDir } from "./paths.js";

export const VAULT_PROMISE =
  "We see the claim while a job runs. We do not keep a plaintext pitch as a product dataset.";

const ALGO = "aes-256-gcm";

let cachedMaster: Buffer | undefined;

export function resetMasterCache(): void {
  cachedMaster = undefined;
}

function decodeKey(raw: string): Buffer {
  const s = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, "hex");
  const b = Buffer.from(s, "base64");
  if (b.length !== 32) {
    throw new Error("TINGLE_VAULT_MASTER must be 32 bytes (64 hex chars or base64)");
  }
  return b;
}

/** Envelope master. Env wins; otherwise a gitignored key file is created. */
export function masterKey(): Buffer {
  if (cachedMaster) return cachedMaster;
  const fromEnv = process.env.TINGLE_VAULT_MASTER?.trim();
  if (fromEnv) {
    cachedMaster = decodeKey(fromEnv);
    return cachedMaster;
  }
  const file = path.join(tingleDataDir(), "vault.key");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) {
      cachedMaster = decodeKey(existing);
      return cachedMaster;
    }
  } catch {
    // first run
  }
  const generated = randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, generated.toString("hex"), { mode: 0o600 });
  cachedMaster = generated;
  return cachedMaster;
}

export function newDek(): Buffer {
  return randomBytes(32);
}

export function seal(key: Buffer, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function open<T>(key: Buffer, blob: string): T {
  const [ver, ivB, tagB, encB] = blob.split(".");
  if (ver !== "v1" || !ivB || !tagB || !encB) {
    throw new Error("invalid vault blob");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encB, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as T;
}

export function wrapDek(dek: Buffer): string {
  return seal(masterKey(), dek.toString("base64"));
}

export function unwrapDek(wrapped: string): Buffer {
  const b64 = open<string>(masterKey(), wrapped);
  return Buffer.from(b64, "base64");
}

export function isVaultBlob(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("v1.");
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const s of secrets) {
    const v = s?.trim();
    if (!v || v.length < 8) continue;
    out = out.split(v).join("[redacted]");
  }
  return out;
}

export function dumpContains(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}
