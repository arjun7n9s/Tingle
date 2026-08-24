import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClientError } from "./clientError.js";
import { EmailPasswordBody, QuickChatBody, parseBody } from "./bodies.js";

describe("HTTP body edge", () => {
  it("rejects a short password at the boundary", () => {
    assert.throws(
      () => parseBody(EmailPasswordBody, { email: "a@b.co", password: "short" }),
      (err: unknown) =>
        err instanceof ClientError &&
        err.status === 400 &&
        /password/.test(err.message),
    );
  });

  it("rejects an empty quick-chat message", () => {
    assert.throws(
      () => parseBody(QuickChatBody, { message: "  " }),
      (err: unknown) => err instanceof ClientError && /message required/.test(err.message),
    );
  });

  it("accepts a valid email + password", () => {
    const body = parseBody(EmailPasswordBody, {
      email: "  judge@example.com ",
      password: "password1",
    });
    assert.equal(body.email, "judge@example.com");
  });
});
