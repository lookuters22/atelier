import { describe, expect, it } from "vitest";
import {
  applyGmailRenderRefToMaterializationArtifactV1,
  gmailImportCandidateArtifactInlineHtmlRepairEligibility,
} from "./gmailRepairImportCandidateMaterializationArtifact.ts";
import type { GmailMaterializationArtifactV1 } from "./gmailMaterializationArtifactV1.ts";

describe("gmailRepairImportCandidateMaterializationArtifact (A2)", () => {
  const baseArtifact = (): GmailMaterializationArtifactV1 => ({
    version: 1,
    body: "Plain body for agents",
    metadata: {
      gmail_import: {
        gmail_message_id: "g1",
        body_html_sanitized: "<p>heavy</p>",
        had_html: true,
      },
    },
    raw_payload: { gmail_thread_id: "t1" },
    gmail_message_id: "g1",
    staged_attachments: [],
  });

  it("eligibility: eligible when inline html and no ref / FK", () => {
    expect(gmailImportCandidateArtifactInlineHtmlRepairEligibility(baseArtifact(), null)).toBe("eligible");
  });

  it("eligibility: skipped_already_ref when nested render_html_ref present (idempotent reruns)", () => {
    const a = baseArtifact();
    (a.metadata as Record<string, unknown>).gmail_import = {
      ...(a.metadata as { gmail_import: Record<string, unknown> }).gmail_import,
      render_html_ref: {
        version: 1,
        artifact_id: "x",
        storage_bucket: "message_attachment_media",
        storage_path: "p/a.html",
        byte_size: 3,
      },
      body_html_sanitized: "<p>should be ignored when ref wins</p>",
    };
    expect(gmailImportCandidateArtifactInlineHtmlRepairEligibility(a, null)).toBe("skipped_already_ref");
  });

  it("eligibility: skipped_artifact_fk when materialization_render_artifact_id set on row", () => {
    expect(gmailImportCandidateArtifactInlineHtmlRepairEligibility(baseArtifact(), "fk-uuid")).toBe(
      "skipped_artifact_fk",
    );
  });

  it("eligibility: skipped_no_inline for non-V1 artifact", () => {
    expect(gmailImportCandidateArtifactInlineHtmlRepairEligibility({ version: 2 }, null)).toBe(
      "skipped_no_inline",
    );
  });

  it("applyGmailRenderRefToMaterializationArtifactV1 strips inline html, preserves body and staged_attachments", () => {
    const ref = {
      version: 1 as const,
      artifact_id: "art-1",
      storage_bucket: "message_attachment_media",
      storage_path: "pid/gmail_render/x.html",
      byte_size: 99,
    };
    const a = baseArtifact();
    const out = applyGmailRenderRefToMaterializationArtifactV1(a, ref);
    expect(out.body).toBe("Plain body for agents");
    expect(out.staged_attachments).toEqual([]);
    expect(out.raw_payload).toEqual({ gmail_thread_id: "t1" });
    const gi = out.metadata.gmail_import as Record<string, unknown>;
    expect(gi.body_html_sanitized).toBeUndefined();
    expect(gi.render_html_ref).toEqual(ref);
    expect(gi.had_html).toBe(true);
  });
});
