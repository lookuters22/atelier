import { describe, expect, it } from "vitest";
import {
  formatOfferBuilderChangeProposalForReview,
  offerBuilderMetadataPatchHasEffect,
  validateOfferBuilderChangeProposalV1,
} from "./offerBuilderChangeProposalBounds.ts";

const BASE = {
  schema_version: 1,
  source: "operator_assistant" as const,
  proposed_at: "2026-04-20T10:00:00.000Z",
  rationale: "Rename for clarity",
  project_id: "a0eebc99-9c0b-4ef8-8bb2-000000000001",
  metadata_patch: { name: "  Premium  " },
};

describe("validateOfferBuilderChangeProposalV1", () => {
  it("accepts minimal v1 with trimmed name", () => {
    const r = validateOfferBuilderChangeProposalV1(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.project_id).toBe("a0eebc99-9c0b-4ef8-8bb2-000000000001");
      expect(r.value.metadata_patch.name).toBe("Premium");
    }
  });

  it("accepts root_title-only patch", () => {
    const r = validateOfferBuilderChangeProposalV1({
      ...BASE,
      metadata_patch: { root_title: "  Client guide  " },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.metadata_patch.root_title).toBe("Client guide");
      expect(r.value.metadata_patch.name).toBeUndefined();
    }
  });

  it("rejects unknown metadata_patch key", () => {
    const r = validateOfferBuilderChangeProposalV1({
      ...BASE,
      metadata_patch: { name: "X", content: "bad" } as never,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects empty metadata patch", () => {
    const r = validateOfferBuilderChangeProposalV1({
      ...BASE,
      metadata_patch: { name: "  ", root_title: "" },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-UUID project_id", () => {
    const r = validateOfferBuilderChangeProposalV1({
      ...BASE,
      project_id: "not-a-uuid",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects top-level extra keys", () => {
    const r = validateOfferBuilderChangeProposalV1({
      ...BASE,
      puck_data: {},
    } as never);
    expect(r.ok).toBe(false);
  });
});

describe("offerBuilderMetadataPatchHasEffect", () => {
  it("is false when only whitespace", () => {
    expect(offerBuilderMetadataPatchHasEffect({ name: "   " })).toBe(false);
  });
  it("is true for root_title", () => {
    expect(offerBuilderMetadataPatchHasEffect({ root_title: "Guide" })).toBe(true);
  });
});

describe("formatOfferBuilderChangeProposalForReview", () => {
  it("includes project id and patch lines", () => {
    const lines = formatOfferBuilderChangeProposalForReview({
      schema_version: 1,
      source: "operator",
      proposed_at: "2026-01-01T00:00:00.000Z",
      rationale: "R",
      project_id: "a0eebc99-9c0b-4ef8-8bb2-000000000001",
      metadata_patch: { name: "A", root_title: "B" },
    });
    expect(lines.join("\n")).toContain("a0eebc99-9c0b-4ef8-8bb2-000000000001");
    expect(lines.some((l) => l.includes("name:"))).toBe(true);
    expect(lines.some((l) => l.includes("root_title:"))).toBe(true);
  });
});
