import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldAttachmentText, parseIncomingAttachments, extractPdfText } from "./attachments.js";

describe("attachments", () => {
  it("folds text files into docs and names photos", () => {
    const text = foldAttachmentText("pitch notes", [
      { name: "spec.md", kind: "text", text: "# Glove\nHaptic nav." },
      { name: "proto.jpg", kind: "image" },
    ]);
    assert.match(text, /pitch notes/);
    assert.match(text, /From spec\.md/);
    assert.match(text, /Haptic nav/);
    assert.match(text, /Attached photo: proto\.jpg/);
  });

  it("ignores junk rows and caps the list", () => {
    const parsed = parseIncomingAttachments([
      { name: "ok.txt", kind: "text", text: "hello" },
      { name: "  " },
      null,
      { name: "pic.png", kind: "image" },
    ]);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].name, "ok.txt");
    assert.equal(parsed[1].kind, "image");
  });

  it("pulls printable strings out of an uncompressed PDF", () => {
    const pdf = Buffer.from(
      "%PDF-1.1\n(Haptic watch claim)\n%%EOF\n",
      "latin1",
    );
    const text = extractPdfText(pdf);
    assert.match(text, /Haptic watch claim/);
    assert.equal(extractPdfText(Buffer.from("not a pdf")), "");
  });
});
