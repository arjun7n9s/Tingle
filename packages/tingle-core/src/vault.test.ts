import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { masterKey, newDek, open, redactSecrets, resetMasterCache, seal } from "./vault.js";

describe("vault", () => {
  it("round-trips JSON under envelope encryption", () => {
    process.env.TINGLE_VAULT_MASTER = "ab".repeat(32);
    resetMasterCache();
    const dek = newDek();
    const blob = seal(dek, { pitch: "secret idea sentence" });
    assert.match(blob, /^v1\./);
    assert.equal(open<{ pitch: string }>(dek, blob).pitch, "secret idea sentence");
    assert.notEqual(blob.includes("secret idea"), true);
    const wrapped = seal(masterKey(), dek.toString("base64"));
    const again = Buffer.from(open<string>(masterKey(), wrapped), "base64");
    assert.deepEqual([...again], [...dek]);
  });

  it("redacts a claim from log lines", () => {
    const out = redactSecrets("failed on a watch that tells indie builders xyz", [
      "a watch that tells indie builders xyz",
    ]);
    assert.equal(out.includes("indie builders xyz"), false);
    assert.match(out, /\[redacted\]/);
  });
});
