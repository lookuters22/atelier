import { describe, expect, it } from "vitest";
import {
  formatInvoiceSetupChangeProposalForReview,
  invoiceSetupTemplatePatchHasEffect,
  validateInvoiceSetupChangeProposalV1,
} from "./invoiceSetupChangeProposalBounds";

const base = () => ({
  schema_version: 1,
  source: "operator_assistant" as const,
  proposed_at: "2026-04-22T12:00:00.000Z",
  rationale: "Align prefix with brand",
});

describe("validateInvoiceSetupChangeProposalV1", () => {
  it("accepts a minimal valid proposal (one field)", () => {
    const r = validateInvoiceSetupChangeProposalV1({
      ...base(),
      template_patch: { invoicePrefix: "ZED" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.template_patch).toEqual({ invoicePrefix: "ZED" });
    }
  });

  it("accepts multiple template fields and trims strings", () => {
    const r = validateInvoiceSetupChangeProposalV1({
      ...base(),
      template_patch: {
        legalName: "  Acme  ",
        accentColor: " #3B4ed0 ",
        footerNote: "  Thanks!  ",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.template_patch.legalName).toBe("Acme");
      expect(r.value.template_patch.accentColor).toBe("#3B4ed0");
      expect(r.value.template_patch.footerNote).toBe("Thanks!");
    }
  });

  it("rejects unknown template_patch key", () => {
    const r = validateInvoiceSetupChangeProposalV1({
      ...base(),
      template_patch: { legalName: "A", logoDataUrl: "data:image/x" },
    } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown key/i);
  });

  it("rejects bad accent color", () => {
    const r = validateInvoiceSetupChangeProposalV1({
      ...base(),
      template_patch: { accentColor: "blue" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/hex/);
  });

  it("rejects empty template_patch", () => {
    const r = validateInvoiceSetupChangeProposalV1({
      ...base(),
      template_patch: {},
    });
    expect(r.ok).toBe(false);
  });

  it("allows clearing footer with empty string", () => {
    const r = validateInvoiceSetupChangeProposalV1({
      ...base(),
      template_patch: { footerNote: "   " },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.template_patch.footerNote).toBe("");
  });

  it("rejects top-level extra keys", () => {
    const r = validateInvoiceSetupChangeProposalV1({
      ...base(),
      template_patch: { legalName: "X" },
      extra: 1,
    } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/top-level/);
  });
});

describe("invoiceSetupTemplatePatchHasEffect", () => {
  it("is false for empty object", () => {
    expect(invoiceSetupTemplatePatchHasEffect({})).toBe(false);
  });
});

describe("formatInvoiceSetupChangeProposalForReview", () => {
  it("emits lines for each patch field", () => {
    const lines = formatInvoiceSetupChangeProposalForReview({
      schema_version: 1,
      source: "operator",
      proposed_at: "2026-01-01T00:00:00Z",
      rationale: "Test",
      template_patch: { invoicePrefix: "P", paymentTerms: "Net 30" },
    });
    expect(lines.join("\n")).toContain("invoicePrefix");
    expect(lines.join("\n")).toContain("Net 30");
    expect(lines.join("\n")).toMatch(/logo excluded/i);
  });
});
