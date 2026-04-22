import { describe, expect, it } from "vitest";
import {
  buildInvoiceSetupChangeProposalV1ForConfirm,
  tryParseLlmProposedInvoiceSetupChange,
  normalizeInvoiceSetupChangeProposalsForWidget,
} from "./operatorAssistantInvoiceSetupChangeProposalFromLlm";
import type { OperatorAssistantProposedActionInvoiceSetupChangeProposal } from "../types/operatorAssistantProposedAction.types";

describe("tryParseLlmProposedInvoiceSetupChange", () => {
  it("accepts a valid proposal", () => {
    const r = tryParseLlmProposedInvoiceSetupChange({
      kind: "invoice_setup_change_proposal",
      rationale: "Change prefix",
      template_patch: { invoicePrefix: "INV" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.template_patch.invoicePrefix).toBe("INV");
    }
  });

  it("rejects bad accent (final validation)", () => {
    const r = tryParseLlmProposedInvoiceSetupChange({
      kind: "invoice_setup_change_proposal",
      rationale: "Bad color",
      template_patch: { accentColor: "nope" },
    });
    expect(r.ok).toBe(false);
  });

  it("drops unknown template_patch keys", () => {
    const r = tryParseLlmProposedInvoiceSetupChange({
      kind: "invoice_setup_change_proposal",
      rationale: "x",
      template_patch: { legalName: "A", logoDataUrl: "data:xxx" } as never,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.template_patch.legalName).toBe("A");
      expect((r.value.template_patch as { logoDataUrl?: unknown }).logoDataUrl).toBeUndefined();
    }
  });
});

describe("buildInvoiceSetupChangeProposalV1ForConfirm", () => {
  it("sets source and proposed_at for enqueue", () => {
    const p: OperatorAssistantProposedActionInvoiceSetupChangeProposal = {
      kind: "invoice_setup_change_proposal",
      rationale: "R",
      template_patch: { paymentTerms: "Net 30" },
    };
    const w = buildInvoiceSetupChangeProposalV1ForConfirm(p);
    expect(w.source).toBe("operator_assistant");
    expect(w.schema_version).toBe(1);
    expect(w.proposed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("normalizeInvoiceSetupChangeProposalsForWidget", () => {
  it("returns multiple valid items", () => {
    const out = normalizeInvoiceSetupChangeProposalsForWidget([
      { kind: "invoice_setup_change_proposal", rationale: "a", template_patch: { legalName: "Co" } },
      { kind: "invoice_setup_change_proposal", rationale: "b", template_patch: { accentColor: "#ff00aa" } },
    ]);
    expect(out).toHaveLength(2);
  });
});
