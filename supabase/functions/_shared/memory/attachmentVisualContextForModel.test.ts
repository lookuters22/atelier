import { describe, expect, it } from "vitest";
import {
  buildAttachmentModelRollupFromRows,
  metadataSuggestsSensitiveAttachment,
  SENSITIVE_ATTACHMENT_CUE,
} from "./attachmentSafetyForModelContext.ts";

describe("P12 v1 — attachment visual / document context (metadata only)", () => {
  it("document-like: PDF photobook mockup (stress: typo lives in file — model must not claim to see it)", () => {
    const r = buildAttachmentModelRollupFromRows([
      {
        mime_type: "application/pdf",
        metadata: { original_filename: "Karis_album_spread_v3.pdf" },
        kind: "attachment",
      },
    ]);
    expect(r.summaryLine).toContain("PDF (document)");
    expect(r.sensitiveCue).toBe(false);
  });

  it("visual/reference: JPEG dress photo + annotation stress shape (inventory only)", () => {
    const r = buildAttachmentModelRollupFromRows([
      {
        mime_type: "image/jpeg",
        metadata: { original_filename: "dress_front_annotated.jpg" },
        kind: "attachment",
      },
    ]);
    expect(r.summaryLine).toContain("image (visual/reference)");
  });

  it("multi-attachment thread: PDF + PNG counts and sorts labels", () => {
    const r = buildAttachmentModelRollupFromRows([
      { mime_type: "image/png", metadata: null, kind: "attachment" },
      { mime_type: "application/pdf", metadata: null, kind: "attachment" },
      { mime_type: "image/png", metadata: null, kind: "attachment" },
    ]);
    expect(r.summaryLine).toMatch(/PDF/);
    expect(r.summaryLine).toContain("2× image (visual/reference)");
  });

  it("sensitive-shaped: bank error screenshot filename triggers manual-review cue", () => {
    expect(
      metadataSuggestsSensitiveAttachment({
        original_filename: "Bank_of_America_rejection_screenshot.png",
      }),
    ).toBe(true);
    const r = buildAttachmentModelRollupFromRows([
      {
        mime_type: "image/png",
        metadata: { original_filename: "Bank_of_America_rejection_screenshot.png" },
        kind: "attachment",
      },
    ]);
    expect(r.sensitiveCue).toBe(true);
  });

  it("sensitive: explicit operator/metadata flag without filename", () => {
    expect(metadataSuggestsSensitiveAttachment({ sensitive_for_model: true })).toBe(true);
    const r = buildAttachmentModelRollupFromRows([
      { mime_type: "application/octet-stream", metadata: { sensitive_for_model: true }, kind: "attachment" },
    ]);
    expect(r.sensitiveCue).toBe(true);
  });

  it("redact preamble would include SENSITIVE_ATTACHMENT_CUE when rollup.sensitiveCue (contract)", () => {
    expect(SENSITIVE_ATTACHMENT_CUE).toContain("human review");
    const rollup = buildAttachmentModelRollupFromRows([
      {
        mime_type: "application/pdf",
        metadata: { original_filename: "signed_contract_scan.pdf" },
        kind: "attachment",
      },
    ]);
    expect(rollup.sensitiveCue).toBe(true);
  });
});
