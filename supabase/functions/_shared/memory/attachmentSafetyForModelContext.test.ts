import { describe, expect, it } from "vitest";
import {
  redactMessageBodyForModelContext,
  stripInlineDataUrlsFromText,
  STRUCTURED_ATTACHMENT_BANNER,
} from "./attachmentSafetyForModelContext.ts";

describe("attachmentSafetyForModelContext", () => {
  it("stripInlineDataUrlsFromText removes data-URL base64 blobs", () => {
    const tiny =
      "See screenshot data:image/png;base64,AAAA" +
      "a".repeat(80) +
      " end";
    const out = stripInlineDataUrlsFromText(tiny);
    expect(out).toContain("[inline data URL omitted]");
    expect(out).not.toContain("AAAA");
  });

  it("redactMessageBodyForModelContext prepends banner when structured attachments exist", () => {
    const body = "Please review the contract.";
    const out = redactMessageBodyForModelContext(body, { hasStructuredAttachments: true });
    expect(out.startsWith(STRUCTURED_ATTACHMENT_BANNER)).toBe(true);
    expect(out).toContain("Please review");
  });

  it("redactMessageBodyForModelContext returns banner only when body empty and attachments exist", () => {
    expect(
      redactMessageBodyForModelContext("   ", { hasStructuredAttachments: true }),
    ).toBe(STRUCTURED_ATTACHMENT_BANNER);
  });

  it("passes through normal text when no structured attachments", () => {
    expect(
      redactMessageBodyForModelContext("Hello", { hasStructuredAttachments: false }),
    ).toBe("Hello");
  });
});
