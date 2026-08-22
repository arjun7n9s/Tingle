import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  SessionSchema,
  UserSchema,
  sessionValid,
  type Session,
  type User,
} from "./auth.js";
import { WatchProfileSchema, type WatchProfile } from "./schema/profile.js";

export const BaselineEntrySchema = z.object({
  id: z.string(),
  url: z.string(),
  origin: z.string(),
  /** Detects "this page changed" on a later run. */
  content_hash: z.string(),
  first_seen: z.string(),
});

export const BaselineSchema = z.object({
  project_id: z.string(),
  /** Ties the baseline to the exact claim it was built for. */
  claim_lock: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  entries: z.array(BaselineEntrySchema).default([]),
});

export type Baseline = z.infer<typeof BaselineSchema>;

/**
 * File-backed project storage.
 *
 * Deliberately plain for now. Phase 5 replaces the backend with an encrypted
 * vault, and the file shape is identical either way — storage is the only thing
 * that changes, which is also what makes a repo-local `.tingle/` tree a swap
 * rather than a rewrite.
 */
export class ProjectStore {
  constructor(private readonly rootDir: string) {}

  private dir(projectId: string) {
    return path.join(this.rootDir, "projects", projectId);
  }

  private async writeJson(file: string, value: unknown) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private async readJson(file: string): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      return null;
    }
  }

  // ── users and sessions ───────────────────────────────────────────────────

  private usersFile() {
    return path.join(this.rootDir, "users.json");
  }
  private sessionsFile() {
    return path.join(this.rootDir, "sessions.json");
  }

  async listUsers(): Promise<User[]> {
    const raw = (await this.readJson(this.usersFile())) ?? [];
    return z.array(UserSchema).safeParse(raw).data ?? [];
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const target = email.trim().toLowerCase();
    return (await this.listUsers()).find((u) => u.email === target) ?? null;
  }

  async findUserById(id: string): Promise<User | null> {
    return (await this.listUsers()).find((u) => u.id === id) ?? null;
  }

  async addUser(user: User): Promise<void> {
    const users = await this.listUsers();
    if (users.some((u) => u.email === user.email)) {
      throw new Error("an account with that email already exists");
    }
    await this.writeJson(this.usersFile(), [...users, user]);
  }

  async addSession(session: Session): Promise<void> {
    const all = z
      .array(SessionSchema)
      .safeParse((await this.readJson(this.sessionsFile())) ?? []).data ?? [];
    // Drop expired rows on write, so the file does not grow forever.
    const live = all.filter((s) => sessionValid(s));
    await this.writeJson(this.sessionsFile(), [...live, session]);
  }

  async findSession(token: string): Promise<Session | null> {
    const all = z
      .array(SessionSchema)
      .safeParse((await this.readJson(this.sessionsFile())) ?? []).data ?? [];
    const found = all.find((s) => s.token === token);
    return found && sessionValid(found) ? found : null;
  }

  async removeSession(token: string): Promise<void> {
    const all = z
      .array(SessionSchema)
      .safeParse((await this.readJson(this.sessionsFile())) ?? []).data ?? [];
    await this.writeJson(
      this.sessionsFile(),
      all.filter((s) => s.token !== token && sessionValid(s)),
    );
  }

  // ── projects ─────────────────────────────────────────────────────────────

  /** Which projects belong to a user. Kept as an index so listing is cheap. */
  private ownerFile() {
    return path.join(this.rootDir, "project-owners.json");
  }

  async claimProject(userId: string, projectId: string): Promise<void> {
    const map = (await this.readJson(this.ownerFile())) as Record<
      string,
      string
    > | null;
    const next = { ...(map ?? {}), [projectId]: userId };
    await this.writeJson(this.ownerFile(), next);
  }

  async listProjects(userId: string): Promise<WatchProfile[]> {
    const map =
      ((await this.readJson(this.ownerFile())) as Record<string, string>) ?? {};
    const ids = Object.entries(map)
      .filter(([, owner]) => owner === userId)
      .map(([id]) => id);
    const out: WatchProfile[] = [];
    for (const id of ids) {
      const p = await this.loadProfile(id);
      if (p) out.push(p);
    }
    return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async ownsProject(userId: string, projectId: string): Promise<boolean> {
    const map =
      ((await this.readJson(this.ownerFile())) as Record<string, string>) ?? {};
    return map[projectId] === userId;
  }

  /** Last first-look result, so the project page and analyst have something to read. */
  async saveLastLook(projectId: string, payload: unknown): Promise<void> {
    await this.writeJson(
      path.join(this.dir(projectId), "last-look.json"),
      payload,
    );
  }

  async loadLastLook(projectId: string): Promise<any | null> {
    return this.readJson(path.join(this.dir(projectId), "last-look.json"));
  }

  async saveProfile(profile: WatchProfile): Promise<void> {
    await this.writeJson(
      path.join(this.dir(profile.project_id), "profile.json"),
      profile,
    );
  }

  async loadProfile(projectId: string): Promise<WatchProfile | null> {
    const raw = await this.readJson(
      path.join(this.dir(projectId), "profile.json"),
    );
    if (!raw) return null;
    const parsed = WatchProfileSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async loadBaseline(projectId: string): Promise<Baseline | null> {
    const raw = await this.readJson(
      path.join(this.dir(projectId), "baseline.json"),
    );
    if (!raw) return null;
    const parsed = BaselineSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  /**
   * Write the baseline after a successful first look.
   *
   * Append-only on `first_seen`: a row already in the baseline keeps its
   * original timestamp, so "when did this appear" survives later runs. Content
   * hashes are updated in place, because that is how a changed page is
   * detected without losing the discovery date.
   */
  async saveBaseline(
    projectId: string,
    claimLock: string,
    entries: Array<{ id: string; url: string; origin: string; content_hash: string }>,
  ): Promise<Baseline> {
    const now = new Date().toISOString();
    const existing = await this.loadBaseline(projectId);
    const byId = new Map(
      (existing?.claim_lock === claimLock ? existing.entries : []).map((e) => [
        e.id,
        e,
      ]),
    );

    for (const e of entries) {
      const prior = byId.get(e.id);
      byId.set(e.id, {
        ...e,
        first_seen: prior?.first_seen ?? now,
      });
    }

    const baseline: Baseline = {
      project_id: projectId,
      claim_lock: claimLock,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      entries: [...byId.values()],
    };
    await this.writeJson(
      path.join(this.dir(projectId), "baseline.json"),
      baseline,
    );
    return baseline;
  }
}
