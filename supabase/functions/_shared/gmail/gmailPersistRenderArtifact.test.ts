import { describe, expect, it } from "vitest";
import {
  applyGmailRenderRefToMetadata,
  parseGmailImportRenderHtmlRefFromMetadata,
  type GmailImportRenderHtmlRefV1,
} from "./gmailPersistRenderArtifact.ts";

describe("gmailPersistRenderArtifact (A2/G3 read/write boundary)", () => {
  const ref: GmailImportRenderHtmlRefV1 = {
    version: 1,
    artifact_id: "art-1",
    storage_bucket: "bucket",
    storage_path: "pid/gmail_render/x.html",
    byte_size: 42,
  };

  it("applyGmailRenderRefToMetadata strips inline body_html_sanitized and sets render_html_ref", () => {
    const meta = applyGmailRenderRefToMetadata(
      {
        gmail_import: {
          body_html_sanitized: "<p>heavy</p>".repeat(100),
          had_html: true,
        },
      },
      ref,
    );
    const gi = meta.gmail_import as Record<string, unknown>;
    expect(gi.body_html_sanitized).toBeUndefined();
    expect(gi.render_html_ref).toEqual(ref);
    expect(gi.had_html).toBe(true);
  });

  it("parseGmailImportRenderHtmlRefFromMetadata round-trips applyGmailRenderRefToMetadata", () => {
    const meta = applyGmailRenderRefToMetadata({ gmail_import: {} }, ref);
    expect(parseGmailImportRenderHtmlRefFromMetadata(meta)).toEqual(ref);
  });

  it("parseGmailImportRenderHtmlRefFromMetadata returns null for inline-only legacy metadata", () => {
    const meta = {
      gmail_import: { body_html_sanitized: "<p>legacy</p>" },
    };
    expect(parseGmailImportRenderHtmlRefFromMetadata(meta)).toBeNull();
  });
});
