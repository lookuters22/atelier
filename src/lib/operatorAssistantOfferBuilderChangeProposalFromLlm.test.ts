import { describe, expect, it } from "vitest";
import { tryParseLlmProposedOfferBuilderChange } from "./operatorAssistantOfferBuilderChangeProposalFromLlm.ts";

const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";

describe("tryParseLlmProposedOfferBuilderChange", () => {
  it("accepts name + project_id and validates full wire shape", () => {
    const r = tryParseLlmProposedOfferBuilderChange({
      kind: "offer_builder_change_proposal",
      rationale: "Rename the premium list label.",
      project_id: pid,
      metadata_patch: { name: "Luxury Weddings" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe("offer_builder_change_proposal");
      expect(r.value.project_id).toBe(pid);
      expect(r.value.metadata_patch.name).toBe("Luxury Weddings");
    }
  });

  it("drops non-allowlisted keys when a valid patch still remains", () => {
    const r = tryParseLlmProposedOfferBuilderChange({
      kind: "offer_builder_change_proposal",
      rationale: "x",
      project_id: pid,
      metadata_patch: { name: "OK", content: "bad" } as never,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.metadata_patch.name).toBe("OK");
    }
  });

  it("fails when only non-allowlisted keys are present in metadata_patch", () => {
    const r = tryParseLlmProposedOfferBuilderChange({
      kind: "offer_builder_change_proposal",
      rationale: "x",
      project_id: pid,
      metadata_patch: { content: "bad" } as never,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects empty metadata_patch effect", () => {
    const r = tryParseLlmProposedOfferBuilderChange({
      kind: "offer_builder_change_proposal",
      rationale: "x",
      project_id: pid,
      metadata_patch: { name: "  " },
    });
    expect(r.ok).toBe(false);
  });
});
