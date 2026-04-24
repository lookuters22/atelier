import { describe, expect, it } from "vitest";
import {
  projectCommercialAmendmentDeltasHaveEffect,
  validateProjectCommercialAmendmentProposalV1,
} from "./projectCommercialAmendmentProposalBounds.ts";

const base = {
  schema_version: 1 as const,
  source: "operator_assistant" as const,
  proposed_at: "2026-04-23T10:00:00.000Z",
  rationale: "Operator confirmed scope shift.",
  wedding_id: "c0eebc99-9c0b-4ef8-8bb6-333333333333",
  change_categories: ["pricing"] as const,
  deltas: { pricing: { summary: "+15% rush fee" } },
};

describe("validateProjectCommercialAmendmentProposalV1", () => {
  it("accepts a minimal pricing amendment", () => {
    const r = validateProjectCommercialAmendmentProposalV1(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.change_categories).toEqual(["pricing"]);
      expect(r.value.deltas.pricing?.summary).toBe("+15% rush fee");
    }
  });

  it("accepts scope add/remove", () => {
    const r = validateProjectCommercialAmendmentProposalV1({
      ...base,
      change_categories: ["scope"],
      deltas: {
        scope: { additions: ["Raw files on USB"], removals: ["printed album"] },
      },
    });
    expect(r.ok).toBe(true);
  });

  it("accepts payment_schedule change", () => {
    const r = validateProjectCommercialAmendmentProposalV1({
      ...base,
      change_categories: ["payment_schedule"],
      deltas: { payment_schedule: { summary: "Deposit 40% → 30%; balance 14 days before event." } },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects duplicate categories", () => {
    const r = validateProjectCommercialAmendmentProposalV1({
      ...base,
      change_categories: ["pricing", "pricing"],
      deltas: { pricing: { summary: "x" } },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects extra delta keys", () => {
    const r = validateProjectCommercialAmendmentProposalV1({
      ...base,
      change_categories: ["pricing"],
      deltas: { pricing: { summary: "x" }, scope: { additions: [], removals: [] } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unexpected key/);
  });

  it("rejects empty scope lines", () => {
    const r = validateProjectCommercialAmendmentProposalV1({
      ...base,
      change_categories: ["scope"],
      deltas: { scope: { additions: [], removals: [] } },
    });
    expect(r.ok).toBe(false);
  });

  it("accepts team headcount_delta without summary text", () => {
    const r = validateProjectCommercialAmendmentProposalV1({
      ...base,
      change_categories: ["team"],
      deltas: { team: { summary: "", headcount_delta: 1 } },
    });
    expect(r.ok).toBe(true);
  });
});

describe("projectCommercialAmendmentDeltasHaveEffect", () => {
  it("is false when pricing summary blank", () => {
    expect(
      projectCommercialAmendmentDeltasHaveEffect(["pricing"], { pricing: { summary: "   " } }),
    ).toBe(false);
  });
});
