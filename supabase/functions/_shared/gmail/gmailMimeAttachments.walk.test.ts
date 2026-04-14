import { describe, expect, it } from "vitest";
import { extractPlainAndHtmlFromPayload, type GmailPayloadPart } from "./gmailMessageBody.ts";
import { measureGmailAttachmentPayload, walkGmailPayloadForMaterialization } from "./gmailMimeAttachments.ts";

describe("walkGmailPayloadForMaterialization", () => {
  it("matches extractPlainAndHtmlFromPayload for text parts", () => {
    const payload: GmailPayloadPart = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: "SGVsbG8" } },
        { mimeType: "text/html", body: { data: "PGI+SGVsbG88L2I+" } },
      ],
    };
    const legacy = extractPlainAndHtmlFromPayload(payload);
    const w = walkGmailPayloadForMaterialization(payload);
    expect(w.plain).toBe(legacy.plain);
    expect(w.html).toBe(legacy.html);
  });

  it("matches measureGmailAttachmentPayload raw list (single walk)", () => {
    const payload: GmailPayloadPart = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: "QUI=" },
        },
        {
          mimeType: "application/pdf",
          filename: "a.pdf",
          body: { attachmentId: "ANG1", size: 100 },
        },
      ],
    };
    const w = walkGmailPayloadForMaterialization(payload);
    const m = measureGmailAttachmentPayload(payload);
    expect(w.raw.map((c) => c.attachmentId)).toEqual(m.raw.map((c) => c.attachmentId));
    expect(w.stats.raw_candidates).toBe(m.stats.raw_candidates);
  });
});
