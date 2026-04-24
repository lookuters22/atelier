import { describe, expect, it } from "vitest";
import {
  buildAttachmentModelRollupFromRows,
  redactMessageBodyForModelContext,
  stripInlineDataUrlsFromText,
  STRUCTURED_ATTACHMENT_BANNER,
  SENSITIVE_ATTACHMENT_CUE,
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

  it("P12: prepends MIME inventory when attachmentRollup is provided", () => {
    const rollup = buildAttachmentModelRollupFromRows([
      { mime_type: "application/pdf", metadata: null, kind: "attachment" },
    ]);
    const out = redactMessageBodyForModelContext("Please see attached.", {
      hasStructuredAttachments: true,
      attachmentRollup: rollup,
    });
    expect(out).toContain(STRUCTURED_ATTACHMENT_BANNER);
    expect(out).toContain("Attachment inventory (metadata only");
    expect(out).toContain("PDF (document)");
    expect(out).toContain("Please see attached.");
  });

  it("P12: sensitive rollup adds conservative cue without claiming file contents", () => {
    const rollup = buildAttachmentModelRollupFromRows([
      {
        mime_type: "image/png",
        metadata: { original_filename: "bank_transfer_error.png" },
        kind: "attachment",
      },
    ]);
    const out = redactMessageBodyForModelContext("", {
      hasStructuredAttachments: true,
      attachmentRollup: rollup,
    });
    expect(out).toContain(SENSITIVE_ATTACHMENT_CUE);
    expect(out).toContain("image (visual/reference)");
  });
});
