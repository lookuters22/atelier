import { describe, expect, it } from "vitest";
import { tryParseLlmProposedMemoryNote } from "../../supabase/functions/_shared/operatorStudioAssistant/validateOperatorAssistantMemoryPayload.ts";
import {
  normalizeProjectCommercialAmendmentProposalsForWidget,
  tryParseLlmProposedProjectCommercialAmendment,
} from "./operatorAssistantProjectCommercialAmendmentProposalFromLlm.ts";

const wid = "d0eebc99-9c0b-4ef8-8bb6-444444444444";

describe("tryParseLlmProposedProjectCommercialAmendment", () => {
  it("parses wedding_id alias", () => {
    const r = tryParseLlmProposedProjectCommercialAmendment({
      kind: "project_commercial_amendment_proposal",
      rationale: "x",
      wedding_id: wid,
      change_categories: ["timeline"],
      deltas: { timeline: { summary: "Delivery moved 2 weeks earlier" } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.weddingId).toBe(wid);
  });

  it("rejects invalid wedding id", () => {
    const r = tryParseLlmProposedProjectCommercialAmendment({
      kind: "project_commercial_amendment_proposal",
      rationale: "x",
      weddingId: "not-uuid",
      changeCategories: ["pricing"],
      deltas: { pricing: { summary: "10" } },
    });
    expect(r.ok).toBe(false);
  });

  it("normalizes widget array", () => {
    const xs = normalizeProjectCommercialAmendmentProposalsForWidget([
      {
        kind: "project_commercial_amendment_proposal",
        rationale: "Studio-wide rule", // wrong kind of change — still valid shape; not a playbook candidate
        weddingId: wid,
        changeCategories: ["pricing"],
        deltas: { pricing: { summary: "One-off project price match" } },
      },
      { kind: "project_commercial_amendment_proposal", bad: true },
    ]);
    expect(xs).toHaveLength(1);
    expect(xs[0]!.changeCategories).toEqual(["pricing"]);
  });
});

describe("commercial amendment vs memory_note (thread-analysis-shaped)", () => {
  it("does not treat memory_note as amendment", () => {
    const mem = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "project",
      title: "Verbal upsell",
      outcome: "They want the premium album add-on discussed on WhatsApp.",
      summary: "",
      fullContent: "Couple agreed verbally; no signed addendum yet.",
      weddingId: wid,
      captureChannel: "whatsapp",
    });
    expect(mem.ok).toBe(true);

    const amd = tryParseLlmProposedProjectCommercialAmendment({
      kind: "project_commercial_amendment_proposal",
      rationale: "Record accepted upsell for CRM review queue.",
      weddingId: wid,
      changeCategories: ["scope", "pricing"],
      deltas: {
        scope: { additions: ["Premium layflat album (40 pages)"], removals: [] },
        pricing: { summary: "+€850 per verbal agreement 2026-04-20" },
      },
    });
    expect(amd.ok).toBe(true);
    if (mem.ok && amd.ok) {
      expect(mem.value.kind).toBe("memory_note");
      expect(amd.value.kind).toBe("project_commercial_amendment_proposal");
    }
  });
});
