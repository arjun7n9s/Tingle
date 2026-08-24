import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  githubMirrorRoot,
  parseGithubRepoRef,
  renderTingleFiles,
  syncTingleTree,
} from "./githubStorage.js";
import { DEFAULT_BUDGET } from "./schema/profile.js";

describe("github .tingle tree", () => {
  it("parses owner/name", () => {
    assert.deepEqual(parseGithubRepoRef("acme/watch"), {
      owner: "acme",
      repo: "watch",
    });
  });

  it("writes the tree to the mock mirror", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tingle-gh-"));
    const prev = process.env.TINGLE_DATA_DIR;
    process.env.TINGLE_DATA_DIR = dir;
    try {
      const snap = {
        profile: {
          project_id: "p1",
          stage: "starting" as const,
          claim: "a watch that tells indie builders when someone else ships their idea",
          fingerprints: ["watch"],
          must_match: [],
          ignore: [],
          sources: ["search", "watch"],
          baseline_ids: [],
          links: [],
          watch_list: [],
          tingle_on: false,
          digest_floor: "daily" as const,
          budget: { ...DEFAULT_BUDGET },
          paused: false,
          stealth: false,
          storage: "github" as const,
        },
        events: [],
        stealth: false,
        artifacts: { pitch: "secret pitch" },
      };
      const files = renderTingleFiles(snap);
      assert.ok(files[".tingle/profile.yml"]?.includes("project_id"));
      assert.ok(files[".tingle/artifacts/pitch.txt"]?.includes("secret pitch"));
      const written = await syncTingleTree(
        { owner: "acme", repo: "private-watch", token: "mock", mock: true },
        snap,
      );
      assert.equal(written.backend, "mock");
      const body = await fs.readFile(
        path.join(
          githubMirrorRoot({ owner: "acme", repo: "private-watch" }),
          ".tingle",
          "profile.yml",
        ),
        "utf8",
      );
      assert.match(body, /private-watch|project_id/);
    } finally {
      if (prev === undefined) delete process.env.TINGLE_DATA_DIR;
      else process.env.TINGLE_DATA_DIR = prev;
    }
  });

  it("omits pitch when stealth", () => {
    const files = renderTingleFiles({
      profile: {
        project_id: "p1",
        stage: "starting",
        claim: "hidden",
        fingerprints: [],
        must_match: [],
        ignore: [],
        sources: [],
        baseline_ids: [],
        links: [],
        watch_list: [],
        tingle_on: false,
        digest_floor: "daily",
        budget: { ...DEFAULT_BUDGET },
        paused: false,
        stealth: true,
        storage: "github",
      },
      events: [],
      stealth: true,
      artifacts: { pitch: "do not write" },
    });
    assert.equal(files[".tingle/artifacts/pitch.txt"], undefined);
  });
});
