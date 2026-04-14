import { describe, expect, it } from "vitest";
import { gmailMessageInlineHtmlRepairEligibility } from "./gmailRepairInlineHtmlToArtifact.ts";

describe("gmailRepairInlineHtmlToArtifact (A2 idempotency / eligibility)", () => {
  it("eligible when inline body_html_sanitized and no ref or FK", () => {
    expect(
      gmailMessageInlineHtmlRepairEligibility(
        { gmail_import: { body_html_sanitized: "<p>x</p>" } },
        null,
      ),
    ).toBe("eligible");
  });

  it("skipped_already_ref when render_html_ref present (idempotent skip for reruns)", () => {
    expect(
      gmailMessageInlineHtmlRepairEligibility(
        {
          gmail_import: {
            body_html_sanitized: "<p>legacy</p>",
            render_html_ref: {
              version: 1,
              artifact_id: "a",
              storage_bucket: "message_attachment_media",
              storage_path: "p/x.html",
              byte_size: 1,
            },
          },
        },
        null,
      ),
    ).toBe("skipped_already_ref");
  });

  it("skipped_artifact_fk when messages.gmail_render_artifact_id set", () => {
    expect(
      gmailMessageInlineHtmlRepairEligibility({ gmail_import: { body_html_sanitized: "<p>x</p>" } }, "uuid-1"),
    ).toBe("skipped_artifact_fk");
  });

  it("skipped_no_inline when gmail_import missing or empty body html", () => {
    expect(gmailMessageInlineHtmlRepairEligibility({}, null)).toBe("skipped_no_inline");
    expect(
      gmailMessageInlineHtmlRepairEligibility({ gmail_import: { body_html_sanitized: "  " } }, null),
    ).toBe("skipped_no_inline");
  });
});
