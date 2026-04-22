import { describe, expect, it } from "vitest";
import type { InvoiceSetupChangeProposalV1 } from "../types/invoiceSetupChangeProposal.types.ts";
import {
  buildInvoiceSetupChangeProposalDiff,
  type InvoiceSetupLiveTemplateSlice,
} from "./invoiceSetupChangeProposalDiff";

const baseProposal = (): InvoiceSetupChangeProposalV1 => ({
  schema_version: 1,
  source: "operator",
  proposed_at: "2026-04-20T10:00:00.000Z",
  rationale: "Test",
  template_patch: { legalName: "New Studio" },
});

const live: InvoiceSetupLiveTemplateSlice = {
  legalName: "Old Studio",
  invoicePrefix: "INV",
  paymentTerms: "Net 15",
  accentColor: "#3b4ed0",
  footerNote: "Thanks",
};

describe("buildInvoiceSetupChangeProposalDiff", () => {
  it("returns isEmpty when template_patch has no keys in iteration (empty object)", () => {
    const p: InvoiceSetupChangeProposalV1 = { ...baseProposal(), template_patch: {} as never };
    const r = buildInvoiceSetupChangeProposalDiff(p, live);
    expect(r.isEmpty).toBe(true);
    expect(r.lines).toEqual([]);
  });

  it("diffs legalName current vs proposed", () => {
    const r = buildInvoiceSetupChangeProposalDiff(baseProposal(), live);
    expect(r.isEmpty).toBe(false);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.key).toBe("legalName");
    expect(r.lines[0]!.currentDisplay).toBe("Old Studio");
    expect(r.lines[0]!.proposedDisplay).toBe("New Studio");
  });

  it("includes multiple allowlisted fields in stable key order", () => {
    const p: InvoiceSetupChangeProposalV1 = {
      ...baseProposal(),
      template_patch: {
        accentColor: "#00ff00",
        legalName: "X",
        footerNote: "",
      },
    };
    const r = buildInvoiceSetupChangeProposalDiff(p, live);
    expect(r.lines.map((l) => l.key)).toEqual(["legalName", "accentColor", "footerNote"]);
  });

  it("when live is null, current is unavailable (—) and proposed still shows", () => {
    const r = buildInvoiceSetupChangeProposalDiff(baseProposal(), null);
    expect(r.lines[0]!.currentDisplay).toBe("—");
    expect(r.lines[0]!.proposedDisplay).toBe("New Studio");
  });

  it("when currentUnavailable, current is —", () => {
    const r = buildInvoiceSetupChangeProposalDiff(baseProposal(), live, { currentUnavailable: true });
    expect(r.lines[0]!.currentDisplay).toBe("—");
    expect(r.lines[0]!.proposedDisplay).toBe("New Studio");
  });
});
