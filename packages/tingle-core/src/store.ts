import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { tingleDataDir } from "./paths.js";
import { normalizeBudget, PAUSE_COPY } from "./budget.js";
import type { FirstLookResult } from "./jobs/firstLook.js";
import type { PatentabilityReport } from "./jobs/patentability.js";
import type { OutgoingMail } from "./mail.js";
import type { TingleEvent } from "./schema/events.js";
import {
  DEFAULT_BUDGET,
  type Budget,
  type DigestFloor,
  type Stage,
  type WatchProfile,
} from "./schema/profile.js";
import { titleFromClaim } from "./claim.js";
import { VAULT_PROMISE, newDek, open, seal, unwrapDek, wrapDek } from "./vault.js";
import { ClientError } from "./edge/clientError.js";

const scrypt = promisify(scryptCb);

export type User = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  wrapped_dek: string;
  github_id?: string;
  google_id?: string;
};

export type Session = {
  id: string;
  user_id: string;
  expires_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "analyst";
  text: string;
  at: string;
  /** True when the reply was LLM-narrated over the look JSON. */
  narrated?: boolean;
  /** House = identity / product; look = grounded in scrape JSON. */
  kind?: "house" | "look";
};

export type StoredProject = {
  id: string;
  user_id: string;
  created_at: string;
  stage: Stage;
  extra_question?: string;
  pitch?: string;
  docs_text?: string;
  links: string[];
  github_url?: string;
  watch_list: string[];
  patent_number?: string;
  ignore: string[];
  title?: string;
  claim: string;
  claim_confirmed: boolean;
  claim_locked: boolean;
  draft_claim?: string;
  profile?: WatchProfile;
  last_look?: FirstLookResult;
  last_patentability?: PatentabilityReport;
  messages: ChatMessage[];
  tingle_on: boolean;
  alert_email?: string;
  webhook_url?: string;
  digest_floor: DigestFloor;
  budget: Budget;
  paused: boolean;
  paused_reason?: string;
  events: TingleEvent[];
  last_tick_at?: string;
  last_digest_at?: string;
  mail: OutgoingMail[];
  stealth: boolean;
  collectors: string[];
  revoked: boolean;
  storage: "vault" | "github";
  github_repo?: string;
  github_token?: string;
};

type ProjectSecrets = {
  stage: Stage;
  extra_question?: string;
  pitch?: string;
  docs_text?: string;
  links: string[];
  github_url?: string;
  watch_list: string[];
  patent_number?: string;
  ignore: string[];
  title?: string;
  claim: string;
  claim_confirmed: boolean;
  claim_locked: boolean;
  draft_claim?: string;
  profile?: WatchProfile;
  last_look?: FirstLookResult;
  last_patentability?: PatentabilityReport;
  messages: ChatMessage[];
  events: TingleEvent[];
    mail: OutgoingMail[];
    stealth: boolean;
    github_token?: string;
    webhook_url?: string;
};

type DiskProject = {
  id: string;
  user_id: string;
  created_at: string;
  budget: Budget;
  tingle_on: boolean;
  paused: boolean;
  paused_reason?: string;
  alert_email?: string;
  digest_floor: DigestFloor;
  last_tick_at?: string;
  last_digest_at?: string;
  collectors: string[];
  revoked: boolean;
  storage: "vault" | "github";
  github_repo?: string;
  vault?: string;
};

type Db = {
  users: User[];
  sessions: Session[];
  projects: StoredProject[];
};

type DiskDb = {
  users: User[];
  sessions: Session[];
  projects: DiskProject[];
};

const empty = (): Db => ({ users: [], sessions: [], projects: [] });

const UNREADABLE_DB =
  "db.json exists but could not be read — refusing to overwrite it. Check TINGLE_VAULT_MASTER or restore .data/tingle/db.json.";

let dbQueue: Promise<unknown> = Promise.resolve();
function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = dbQueue.then(fn, fn);
  dbQueue = run.then(() => undefined, () => undefined);
  return run;
}

function dbPath(): string {
  return path.join(tingleDataDir(), "db.json");
}

async function readDbUnlocked(): Promise<Db> {
  let raw: string;
  try {
    raw = await fs.readFile(dbPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw err;
  }
  let parsed: DiskDb;
  try {
    parsed = JSON.parse(raw) as DiskDb;
  } catch {
    throw new Error(`${UNREADABLE_DB} (invalid JSON)`);
  }
  try {
    const users = (parsed.users ?? []).map(ensureDek);
    const sessions = (parsed.sessions ?? []).filter(
      (s) => Date.parse(s.expires_at) > Date.now(),
    );
    const dekByUser = new Map(users.map((u) => [u.id, unwrapDek(u.wrapped_dek)]));
    const projects = (parsed.projects ?? []).map((row) => {
      const dek = dekByUser.get(row.user_id);
      return decodeProject(row, dek);
    });
    const db = { users, sessions, projects };
    const dirty =
      (parsed.users ?? []).some((u) => !u.wrapped_dek) ||
      (parsed.projects ?? []).some((p) => !p.revoked && !p.vault);
    if (dirty) await writeDbUnlocked(db);
    return db;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("db.json exists")) throw err;
    throw new Error(`${UNREADABLE_DB} (${msg})`);
  }
}

async function writeDbUnlocked(db: Db): Promise<void> {
  const file = dbPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  db.sessions = db.sessions.filter((s) => Date.parse(s.expires_at) > Date.now());
  const dekByUser = new Map<string, Buffer>();
  for (const u of db.users) {
    if (!u.wrapped_dek) {
      const dek = newDek();
      u.wrapped_dek = wrapDek(dek);
      dekByUser.set(u.id, dek);
    } else {
      dekByUser.set(u.id, unwrapDek(u.wrapped_dek));
    }
  }
  const disk: DiskDb = {
    users: db.users.map((u) => ({
      id: u.id,
      email: u.email,
      password_hash: u.password_hash,
      created_at: u.created_at,
      wrapped_dek: u.wrapped_dek,
      github_id: u.github_id,
      google_id: u.google_id,
    })),
    sessions: db.sessions,
    projects: db.projects.map((p) =>
      encodeProject(p, dekByUser.get(p.user_id) ?? newDek()),
    ),
  };
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(disk, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function assertDbReadable(): Promise<void> {
  await withDbLock(() => readDbUnlocked());
}

function ensureDek(user: User): User {
  if (user.wrapped_dek) return user;
  return { ...user, wrapped_dek: wrapDek(newDek()) };
}

function encodeProject(p: StoredProject, dek: Buffer): DiskProject {
  const clear: DiskProject = {
    id: p.id,
    user_id: p.user_id,
    created_at: p.created_at,
    budget: p.budget,
    tingle_on: p.tingle_on,
    paused: p.paused,
    paused_reason: p.paused_reason,
    alert_email: p.alert_email,
    digest_floor: p.digest_floor,
    last_tick_at: p.last_tick_at,
    last_digest_at: p.last_digest_at,
    collectors: p.collectors ?? [],
    revoked: Boolean(p.revoked),
    storage: p.storage === "github" ? "github" : "vault",
    github_repo: p.github_repo,
  };
  if (p.revoked) return clear;
  const secrets: ProjectSecrets = {
    stage: p.stage,
    extra_question: p.extra_question,
    pitch: p.pitch,
    docs_text: p.docs_text,
    links: p.links,
    github_url: p.github_url,
    watch_list: p.watch_list,
    patent_number: p.patent_number,
    ignore: p.ignore,
    title: p.title,
    claim: p.claim,
    claim_confirmed: p.claim_confirmed,
    claim_locked: p.claim_locked,
    draft_claim: p.draft_claim,
    profile: p.profile,
    last_look: p.last_look,
    last_patentability: p.last_patentability,
    messages: p.messages,
    events: p.events,
    mail: p.mail,
    stealth: p.stealth,
    github_token: p.github_token,
    webhook_url: p.webhook_url,
  };
  return { ...clear, vault: seal(dek, secrets) };
}

function decodeProject(raw: DiskProject & Partial<StoredProject>, dek?: Buffer): StoredProject {
  const base = {
    id: raw.id,
    user_id: raw.user_id,
    created_at: raw.created_at,
    budget: normalizeBudget(raw.budget),
    tingle_on: Boolean(raw.tingle_on),
    paused: Boolean(raw.paused),
    paused_reason: raw.paused_reason,
    alert_email: raw.alert_email,
    digest_floor: raw.digest_floor === "weekly" ? "weekly" as const : "daily" as const,
    last_tick_at: raw.last_tick_at,
    last_digest_at: raw.last_digest_at,
    collectors: raw.collectors ?? [],
    revoked: Boolean(raw.revoked),
    storage: raw.storage === "github" ? ("github" as const) : ("vault" as const),
    github_repo: raw.github_repo,
  };
  if (raw.revoked) {
    return normalizeProject({
      ...base,
      stage: "starting",
      title: "",
      claim: "",
      claim_confirmed: false,
      claim_locked: false,
      links: [],
      watch_list: [],
      ignore: [],
      messages: [],
      events: [],
      mail: [],
      stealth: false,
      storage: "vault",
      github_repo: undefined,
      github_token: undefined,
    });
  }
  if (typeof raw.vault === "string" && dek) {
    const secrets = open<ProjectSecrets>(dek, raw.vault);
    return normalizeProject({ ...base, ...secrets });
  }
  return normalizeProject(raw as StoredProject);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scrypt(password, salt, 32)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const buf = (await scrypt(password, salt, 32)) as Buffer;
  const a = Buffer.from(hex, "hex");
  if (a.length !== buf.length) return false;
  return timingSafeEqual(a, buf);
}

export async function createUser(email: string, password: string): Promise<User> {
  return withDbLock(async () => {
    const db = await readDbUnlocked();
    const norm = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) {
      throw new ClientError("invalid email");
    }
    if (password.length < 8) {
      throw new ClientError("password must be at least 8 characters");
    }
    if (db.users.some((u) => u.email === norm)) {
      throw new ClientError("email already registered");
    }
    const user: User = {
      id: randomUUID(),
      email: norm,
      password_hash: await hashPassword(password),
      created_at: new Date().toISOString(),
      wrapped_dek: wrapDek(newDek()),
    };
    db.users.push(user);
    await writeDbUnlocked(db);
    return user;
  });
}

/** One-click guest. Fresh account each time so judges don't share a desk. */
export async function createDemoUser(): Promise<User> {
  const token = randomBytes(6).toString("hex");
  return createUser(`demo.${token}@tingle.demo`, randomBytes(18).toString("base64url"));
}

export async function loginUser(
  email: string,
  password: string,
): Promise<User | undefined> {
  const db = await withDbLock(() => readDbUnlocked());
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) return undefined;
  if (user.password_hash.startsWith("oauth:")) return undefined;
  if (!(await verifyPassword(password, user.password_hash))) return undefined;
  return user;
}

export async function upsertOauthUser(input: {
  provider: "github" | "google";
  id: string;
  email: string;
}): Promise<User> {
  return withDbLock(async () => {
    const db = await readDbUnlocked();
    const email = input.email.trim().toLowerCase();
    const key = input.provider === "github" ? "github_id" : "google_id";
    let user = db.users.find((u) => u[key] === input.id);
    if (!user) {
      const byEmail = db.users.find((u) => u.email === email);
      if (byEmail && !byEmail.password_hash.startsWith("oauth:")) {
        throw new ClientError(
          "that email already has a password login — sign in with email first",
        );
      }
      user = byEmail;
    }
    if (user) {
      user[key] = input.id;
      await writeDbUnlocked(db);
      return user;
    }
    user = {
      id: randomUUID(),
      email,
      password_hash: `oauth:${input.provider}:${input.id}`,
      created_at: new Date().toISOString(),
      wrapped_dek: wrapDek(newDek()),
      [key]: input.id,
    };
    db.users.push(user);
    await writeDbUnlocked(db);
    return user;
  });
}

export async function createSession(userId: string): Promise<Session> {
  return withDbLock(async () => {
    const db = await readDbUnlocked();
    const session: Session = {
      id: randomBytes(24).toString("hex"),
      user_id: userId,
      expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    };
    db.sessions.push(session);
    await writeDbUnlocked(db);
    return session;
  });
}

export async function destroySession(sessionId: string): Promise<void> {
  await withDbLock(async () => {
    const db = await readDbUnlocked();
    db.sessions = db.sessions.filter((s) => s.id !== sessionId);
    await writeDbUnlocked(db);
  });
}

export async function userFromSession(
  sessionId: string | undefined,
): Promise<User | undefined> {
  if (!sessionId) return undefined;
  const db = await withDbLock(() => readDbUnlocked());
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return undefined;
  if (Date.parse(session.expires_at) < Date.now()) return undefined;
  return db.users.find((u) => u.id === session.user_id);
}

export async function listProjects(userId: string): Promise<StoredProject[]> {
  const db = await withDbLock(() => readDbUnlocked());
  return db.projects.filter((p) => p.user_id === userId);
}

export async function getProject(
  userId: string,
  projectId: string,
): Promise<StoredProject | undefined> {
  const db = await withDbLock(() => readDbUnlocked());
  const p = db.projects.find((x) => x.id === projectId);
  if (!p || p.user_id !== userId) return undefined;
  return p;
}

export async function saveProject(project: StoredProject): Promise<void> {
  await withDbLock(async () => {
    const db = await readDbUnlocked();
    const i = db.projects.findIndex((p) => p.id === project.id);
    if (i === -1) db.projects.push(project);
    else db.projects[i] = project;
    await writeDbUnlocked(db);
  });
}

export async function revokeProject(
  userId: string,
  projectId: string,
): Promise<StoredProject | undefined> {
  return withDbLock(async () => {
    const db = await readDbUnlocked();
    const p = db.projects.find((x) => x.id === projectId && x.user_id === userId);
    if (!p) return undefined;
    const stub: StoredProject = {
      ...p,
      revoked: true,
      tingle_on: false,
      paused: true,
      paused_reason: "revoked",
      stage: "starting",
      extra_question: undefined,
      pitch: undefined,
      docs_text: undefined,
      links: [],
      github_url: undefined,
      watch_list: [],
      patent_number: undefined,
      ignore: [],
      title: "",
      claim: "",
      claim_confirmed: false,
      claim_locked: false,
      profile: undefined,
      last_look: undefined,
      last_patentability: undefined,
      messages: [],
      events: [],
      mail: [],
      stealth: false,
      alert_email: undefined,
      storage: "vault",
      github_repo: undefined,
      github_token: undefined,
      webhook_url: undefined,
    };
    const i = db.projects.findIndex((x) => x.id === p.id);
    db.projects[i] = stub;
    await writeDbUnlocked(db);
    return stub;
  });
}

export function publicProject(p: StoredProject) {
  if (p.revoked) {
    return {
      id: p.id,
      created_at: p.created_at,
      revoked: true,
      budget: p.budget,
      collectors: p.collectors,
      tingle_on: false,
      paused: true,
      title: "Revoked project",
      claim: "",
      claim_confirmed: false,
      events: [],
      messages: [],
      vault_promise: VAULT_PROMISE,
    };
  }
  return {
    id: p.id,
    created_at: p.created_at,
    stage: p.stage,
    extra_question: p.extra_question,
    title: p.title?.trim() || titleFromClaim(p.claim),
    claim: p.claim,
    claim_confirmed: p.claim_confirmed,
    claim_locked: p.claim_locked,
    draft_claim: p.draft_claim,
    ignore: p.ignore,
    last_look: p.last_look,
    last_patentability: p.last_patentability,
    messages: p.messages,
    github_url: p.github_url,
    tingle_on: p.tingle_on,
    alert_email: p.alert_email,
    webhook_url: p.webhook_url,
    digest_floor: p.digest_floor,
    budget: p.budget,
    paused: p.paused,
    paused_reason: p.paused_reason,
    pause_copy: p.paused ? PAUSE_COPY : undefined,
    events: p.events,
    last_tick_at: p.last_tick_at,
    stealth: p.stealth,
    collectors: p.collectors,
    revoked: false,
    vault_promise: VAULT_PROMISE,
    storage: p.storage === "github" ? "github" : "vault",
    github_repo: p.github_repo,
    github_connected: Boolean(p.github_token),
  };
}

export function newProjectFields(): Pick<
  StoredProject,
  | "tingle_on"
  | "digest_floor"
  | "budget"
  | "paused"
  | "events"
  | "mail"
  | "stealth"
  | "collectors"
  | "revoked"
  | "claim_locked"
  | "storage"
> {
  return {
    tingle_on: false,
    digest_floor: "daily",
    budget: { ...DEFAULT_BUDGET },
    paused: false,
    events: [],
    mail: [],
    stealth: false,
    collectors: [],
    revoked: false,
    claim_locked: false,
    storage: "vault",
  };
}

export async function listWatchingProjects(): Promise<StoredProject[]> {
  const db = await withDbLock(() => readDbUnlocked());
  return db.projects.filter(
    (p) => p.tingle_on && p.claim_confirmed && !p.paused && !p.revoked,
  );
}

export function dbFilePath(): string {
  return dbPath();
}

function normalizeProject(p: StoredProject): StoredProject {
  return {
    ...p,
    tingle_on: Boolean(p.tingle_on),
    digest_floor: p.digest_floor === "weekly" ? "weekly" : "daily",
    budget: normalizeBudget(p.budget),
    paused: Boolean(p.paused),
    events: p.events ?? [],
    mail: p.mail ?? [],
    ignore: p.ignore ?? [],
    links: p.links ?? [],
    watch_list: p.watch_list ?? [],
    messages: p.messages ?? [],
    stealth: Boolean(p.stealth),
    collectors: p.collectors ?? [],
    revoked: Boolean(p.revoked),
    title: p.title,
    claim: p.claim ?? "",
    claim_locked: Boolean(p.claim_locked),
    storage: p.storage === "github" ? "github" : "vault",
    github_repo: p.github_repo,
  };
}
