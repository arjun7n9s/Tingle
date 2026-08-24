import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { resetMasterCache } from "./vault.js";
import {
  createDemoUser,
  createUser,
  listProjects,
  newProjectFields,
  saveProject,
  type StoredProject,
} from "./store.js";

function projectFor(userId: string, id: string, claim: string): StoredProject {
  return {
    id,
    user_id: userId,
    created_at: new Date().toISOString(),
    stage: "starting",
    links: [],
    watch_list: [],
    ignore: [],
    claim,
    claim_confirmed: false,
    messages: [],
    ...newProjectFields(),
  };
}

describe("store", () => {
  let dir = "";
  const prevDir = process.env.TINGLE_DATA_DIR;
  const prevMaster = process.env.TINGLE_VAULT_MASTER;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tingle-store-"));
    process.env.TINGLE_DATA_DIR = dir;
    process.env.TINGLE_VAULT_MASTER = "ab".repeat(32);
    resetMasterCache();
  });

  after(async () => {
    if (prevDir === undefined) delete process.env.TINGLE_DATA_DIR;
    else process.env.TINGLE_DATA_DIR = prevDir;
    if (prevMaster === undefined) delete process.env.TINGLE_VAULT_MASTER;
    else process.env.TINGLE_VAULT_MASTER = prevMaster;
    resetMasterCache();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("mints a unique demo guest", async () => {
    const a = await createDemoUser();
    const b = await createDemoUser();
    assert.match(a.email, /^demo\.[a-f0-9]+@tingle\.demo$/);
    assert.notEqual(a.email, b.email);
    assert.notEqual(a.id, b.id);
  });

  it("keeps both projects when two saves race", async () => {
    const user = await createUser(`race-${Date.now()}@example.com`, "password12");
    await Promise.all([
      saveProject(projectFor(user.id, "p-a", "claim a")),
      saveProject(projectFor(user.id, "p-b", "claim b")),
    ]);
    const rows = await listProjects(user.id);
    assert.equal(rows.length, 2);
  });

  it("refuses to overwrite db.json when the vault master is wrong", async () => {
    const user = await createUser(`vault-${Date.now()}@example.com`, "password12");
    await saveProject(projectFor(user.id, "p-keep", "keep me"));
    const file = path.join(dir, "db.json");
    const before = await fs.readFile(file);
    process.env.TINGLE_VAULT_MASTER = "cd".repeat(32);
    resetMasterCache();
    await assert.rejects(() => listProjects(user.id), /refusing to overwrite/);
    const after = await fs.readFile(file);
    assert.deepEqual(after, before);
    process.env.TINGLE_VAULT_MASTER = "ab".repeat(32);
    resetMasterCache();
  });
});
