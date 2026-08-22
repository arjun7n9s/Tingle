import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { tingleDataDir } from "./paths.js";
import { normalizeBudget, PAUSE_COPY } from "./budget.js";
import type { FirstLookResult } from "./jobs/firstLook.js";
import type { OutgoingMail } from "./mail.js";
import type { TingleEvent } from "./schema/events.js";
import {
  DEFAULT_BUDGET,
  type Budget,
  type DigestFloor,
  type Stage,
  type WatchProfile,
} from "./schema/profile.js";
import { VAULT_PROMISE, newDek, open, seal, unwrapDek, wrapDek } from "./vault.js";

const scrypt = promisify(scryptCb);

export type User = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  wrapped_dek: string;
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
  claim: string;
  claim_confirmed: boolean;
  claim_locked: boolean;
  draft_claim?: string;
  profile?: WatchProfile;
  last_look?: FirstLookResult;
  messages: ChatMessage[];
  tingle_on: boolean;
  alert_email?: string;
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
  claim: string;
  claim_confirmed: boolean;
  claim_locked: boolean;
  draft_claim?: string;
  profile?: WatchProfile;
  last_look?: FirstLookResult;
  messages: ChatMessage[];
  events: TingleEvent[];
  mail: OutgoingMail[];
  stealth: boolean;
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

function dbPath(): string {
  return path.join(tingleDataDir(), "db.json");
}

async function readDb(): Promise<Db> {
  try {
    const raw = await fs.readFile(dbPath(), "utf8");
    const parsed = JSON.parse(raw) as DiskDb;
    const users = (parsed.users ?? []).map(ensureDek);
    const sessions = parsed.sessions ?? [];
    const dekByUser = new Map(users.map((u) => [u.id, unwrapDek(u.wrapped_dek)]));
    const projects = (parsed.projects ?? []).map((row) => {
      const dek = dekByUser.get(row.user_id);
      return decodeProject(row, dek);
    });
    const db = { users, sessions, projects };
    const dirty =
      (parsed.users ?? []).some((u) => !u.wrapped_dek) ||
      (parsed.projects ?? []).some((p) => !p.revoked && !p.vault);
    if (dirty) await writeDb(db);
    return db;
  } catch {
    return empty();
  }
}

async function writeDb(db: Db): Promise<void> {
  const file = dbPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
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
    })),
    sessions: db.sessions,
    projects: db.projects.map((p) =>
      encodeProject(p, dekByUser.get(p.user_id) ?? newDek()),
    ),
  };
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(disk, null, 2), "utf8");
  await fs.rename(tmp, file);
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
    claim: p.claim,
    claim_confirmed: p.claim_confirmed,
    claim_locked: p.claim_locked,
    draft_claim: p.draft_claim,
    profile: p.profile,
    last_look: p.last_look,
    messages: p.messages,
    events: p.events,
    mail: p.mail,
    stealth: p.stealth,
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
  };
  if (raw.revoked) {
    return normalizeProject({
      ...base,
      stage: "starting",
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
  const db = await readDb();
  const norm = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) {
    throw new Error("invalid email");
  }
  if (password.length < 8) throw new Error("password must be at least 8 characters");
  if (db.users.some((u) => u.email === norm)) throw new Error("email already registered");
  const user: User = {
    id: randomUUID(),
    email: norm,
    password_hash: await hashPassword(password),
    created_at: new Date().toISOString(),
    wrapped_dek: wrapDek(newDek()),
  };
  db.users.push(user);
  await writeDb(db);
  return user;
}

export async function loginUser(
  email: string,
  password: string,
): Promise<User | undefined> {
  const db = await readDb();
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) return undefined;
  if (!(await verifyPassword(password, user.password_hash))) return undefined;
  return user;
}

export async function createSession(userId: string): Promise<Session> {
  const db = await readDb();
  const session: Session = {
    id: randomBytes(24).toString("hex"),
    user_id: userId,
    expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
  };
  db.sessions.push(session);
  await writeDb(db);
  return session;
}

export async function destroySession(sessionId: string): Promise<void> {
  const db = await readDb();
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  await writeDb(db);
}

export async function userFromSession(
  sessionId: string | undefined,
): Promise<User | undefined> {
  if (!sessionId) return undefined;
  const db = await readDb();
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return undefined;
  if (Date.parse(session.expires_at) < Date.now()) return undefined;
  return db.users.find((u) => u.id === session.user_id);
}

export async function listProjects(userId: string): Promise<StoredProject[]> {
  const db = await readDb();
  return db.projects.filter((p) => p.user_id === userId);
}

export async function getProject(
  userId: string,
  projectId: string,
): Promise<StoredProject | undefined> {
  const db = await readDb();
  const p = db.projects.find((x) => x.id === projectId);
  if (!p || p.user_id !== userId) return undefined;
  return p;
}

export async function saveProject(project: StoredProject): Promise<void> {
  const db = await readDb();
  const i = db.projects.findIndex((p) => p.id === project.id);
  if (i === -1) db.projects.push(project);
  else db.projects[i] = project;
  await writeDb(db);
}

export async function revokeProject(
  userId: string,
  projectId: string,
): Promise<StoredProject | undefined> {
  const db = await readDb();
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
    claim: "",
    claim_confirmed: false,
    claim_locked: false,
    profile: undefined,
    last_look: undefined,
    messages: [],
    events: [],
    mail: [],
    stealth: false,
    alert_email: undefined,
  };
  const i = db.projects.findIndex((x) => x.id === p.id);
  db.projects[i] = stub;
  await writeDb(db);
  return stub;
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
    claim: p.claim,
    claim_confirmed: p.claim_confirmed,
    claim_locked: p.claim_locked,
    draft_claim: p.draft_claim,
    ignore: p.ignore,
    last_look: p.last_look,
    messages: p.messages,
    github_url: p.github_url,
    tingle_on: p.tingle_on,
    alert_email: p.alert_email,
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
  };
}

export async function listWatchingProjects(): Promise<StoredProject[]> {
  const db = await readDb();
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
    claim: p.claim ?? "",
    claim_locked: Boolean(p.claim_locked),
  };
}
