import { describe, expect, it } from "vitest";
import { composeOperatorAssistantMemorySummaryForStorage } from "../../../../src/lib/composeOperatorAssistantMemorySummary.ts";
import {
  tryParseLlmProposedMemoryNote,
  validateOperatorAssistantMemoryPayload,
} from "./validateOperatorAssistantMemoryPayload.ts";

describe("validateOperatorAssistantMemoryPayload", () => {
  it("rejects when proposalOrigin is missing", () => {
    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/proposalOrigin is required/);
  });

  it("rejects invalid proposalOrigin", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "llm_hallucination",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/proposalOrigin/);
  });

  it("accepts assistant_proposed_confirmed, operator_typed, and assistant_proposed_edited as proposalOrigin", () => {
    const base = {
      memoryScope: "studio" as const,
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
    };
    for (const proposalOrigin of [
      "assistant_proposed_confirmed",
      "operator_typed",
      "assistant_proposed_edited",
    ] as const) {
      const v = validateOperatorAssistantMemoryPayload({ ...base, proposalOrigin });
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.proposalOrigin).toBe(proposalOrigin);
    }
  });

  it("accepts studio scope without wedding or person", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "Pref",
      outcome: "Default is 10h package",
      summary: "Short",
      fullContent: "Longer body of the note",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.memoryScope).toBe("studio");
      expect(v.value.weddingId).toBeNull();
      expect(v.value.personId).toBeNull();
      expect(v.value.audienceSourceTier).toBe("client_visible");
      expect(v.value.summary).toBe(
        composeOperatorAssistantMemorySummaryForStorage("Default is 10h package", "Short", 400),
      );
    }
  });

  it("requires outcome on confirm payload", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      summary: "S",
      fullContent: "F",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/outcome/);
  });

  it("rejects memory text that embeds raw passport or payment identifiers", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "Venue access",
      outcome: "Client sent passport AB1234567 for the security list",
      summary: "Short",
      fullContent: "Longer body",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/passport|identifiers/i);
  });

  it("requires weddingId for project scope", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "project",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects malformed weddingId for project scope (not a UUID)", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "project",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      weddingId: "not-a-uuid",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/weddingId is required/);
  });

  it("rejects UUID-like but invalid version nibble for project weddingId", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "project",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      weddingId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects weddingId for studio scope", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      weddingId: "11111111-1111-4111-8111-111111111111",
    });
    expect(v.ok).toBe(false);
  });

  it("requires personId for person scope and rejects weddingId", () => {
    const bad = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "person",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
    });
    expect(bad.ok).toBe(false);

    const badId = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "person",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      personId: "invented-person-label",
    });
    expect(badId.ok).toBe(false);
    if (!badId.ok) expect(badId.error).toMatch(/personId is required/);

    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "person",
      title: "T",
      outcome: "Prefers email",
      summary: "S",
      fullContent: "F",
      personId: "22222222-2222-4222-8222-222222222222",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.personId).toBe("22222222-2222-4222-8222-222222222222");
      expect(v.value.weddingId).toBeNull();
      expect(v.value.captureChannel).toBeNull();
      expect(v.value.captureOccurredOn).toBeNull();
    }
  });

  it("accepts optional captureChannel and captureOccurredOn when both valid", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "Call note",
      outcome: "Agreed to second shooter",
      summary: "WhatsApp",
      fullContent: "Client confirmed on WhatsApp.",
      captureChannel: "whatsapp",
      captureOccurredOn: "2026-04-20",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.captureChannel).toBe("whatsapp");
      expect(v.value.captureOccurredOn).toBe("2026-04-20");
    }
  });

  it("accepts captureChannel without captureOccurredOn", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      captureChannel: "phone",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.captureChannel).toBe("phone");
      expect(v.value.captureOccurredOn).toBeNull();
    }
  });

  it("accepts in_person and instagram_dm capture channels", () => {
    const inPerson = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "Offered second shooter",
      summary: "S",
      fullContent: "Discussed add-on in person.",
      captureChannel: "in_person",
      captureOccurredOn: "2026-04-22",
    });
    expect(inPerson.ok).toBe(true);
    if (inPerson.ok) expect(inPerson.value.captureChannel).toBe("in_person");

    const ig = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "DM",
      outcome: "Guest count update",
      summary: "S",
      fullContent: "They messaged on Instagram.",
      captureChannel: "instagram_dm",
    });
    expect(ig.ok).toBe(true);
    if (ig.ok) expect(ig.value.captureChannel).toBe("instagram_dm");
  });

  it("rejects invalid captureChannel", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      captureChannel: "signal",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/captureChannel/);
  });

  it("rejects invalid captureOccurredOn", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      captureChannel: "phone",
      captureOccurredOn: "04-20-2026",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/captureOccurredOn/);
  });

  it("rejects captureOccurredOn without captureChannel", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      captureOccurredOn: "2026-04-20",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/captureOccurredOn requires captureChannel/);
  });

  it("rejects invalid calendar date for captureOccurredOn", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      captureChannel: "in_person",
      captureOccurredOn: "2026-02-30",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/valid calendar date/);
  });

  it("defaults audienceSourceTier to client_visible when omitted", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.audienceSourceTier).toBe("client_visible");
  });

  it("accepts audienceSourceTier internal_team and operator_only", () => {
    const internal = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      audienceSourceTier: "internal_team",
    });
    expect(internal.ok).toBe(true);
    if (internal.ok) expect(internal.value.audienceSourceTier).toBe("internal_team");

    const opOnly = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      audienceSourceTier: "operator_only",
    });
    expect(opOnly.ok).toBe(true);
    if (opOnly.ok) expect(opOnly.value.audienceSourceTier).toBe("operator_only");
  });

  it("rejects invalid audienceSourceTier", () => {
    const v = validateOperatorAssistantMemoryPayload({
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "T",
      outcome: "o",
      summary: "S",
      fullContent: "F",
      audienceSourceTier: "public",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/audienceSourceTier/);
  });
});

describe("tryParseLlmProposedMemoryNote", () => {
  it("requires outcome", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "studio",
      title: "x",
      summary: "y",
      fullContent: "z",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts person scope when personId is set", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "person",
      title: "x",
      outcome: "Email only",
      summary: "y",
      fullContent: "z",
      personId: "33333333-3333-4333-8333-333333333333",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.memoryScope).toBe("person");
      expect(r.value.personId).toBe("33333333-3333-4333-8333-333333333333");
      expect(r.value.summary).toBe("y");
      expect(r.value.outcome).toBe("Email only");
    }
  });

  it("accepts captureChannel and captureOccurredOn on LLM-shaped proposal", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "studio",
      title: "Zoom",
      outcome: "Timeline approved verbally",
      summary: "Extra",
      fullContent: "Short narrative.",
      captureChannel: "video_call",
      captureOccurredOn: "2026-03-15",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.captureChannel).toBe("video_call");
      expect(r.value.captureOccurredOn).toBe("2026-03-15");
    }
  });

  it("rejects captureOccurredOn without captureChannel in parser", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "studio",
      title: "x",
      outcome: "o",
      summary: "y",
      fullContent: "z",
      captureOccurredOn: "2026-01-01",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts optional audienceSourceTier on LLM-shaped proposal", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "studio",
      title: "Vendor",
      outcome: "Florist prefers morning drop-off.",
      summary: "Internal",
      fullContent: "Coordinator note.",
      audienceSourceTier: "internal_team",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.audienceSourceTier).toBe("internal_team");
  });

  it("rejects LLM-shaped memory_note with invalid personId (no invented CRM id)", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "person",
      title: "x",
      outcome: "o",
      summary: "y",
      fullContent: "z",
      personId: "not-a-real-uuid",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid audienceSourceTier in parser", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "studio",
      title: "x",
      outcome: "o",
      summary: "y",
      fullContent: "z",
      audienceSourceTier: "everyone",
    });
    expect(r.ok).toBe(false);
  });
});
