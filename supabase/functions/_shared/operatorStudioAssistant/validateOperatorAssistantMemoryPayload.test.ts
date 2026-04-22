import { describe, expect, it } from "vitest";
import {
  tryParseLlmProposedMemoryNote,
  validateOperatorAssistantMemoryPayload,
} from "./validateOperatorAssistantMemoryPayload.ts";

describe("validateOperatorAssistantMemoryPayload", () => {
  it("accepts studio scope without wedding or person", () => {
    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "studio",
      title: "Pref",
      summary: "Short",
      fullContent: "Longer body of the note",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.memoryScope).toBe("studio");
      expect(v.value.weddingId).toBeNull();
      expect(v.value.personId).toBeNull();
    }
  });

  it("requires weddingId for project scope", () => {
    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "project",
      title: "T",
      summary: "S",
      fullContent: "F",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects weddingId for studio scope", () => {
    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "studio",
      title: "T",
      summary: "S",
      fullContent: "F",
      weddingId: "11111111-1111-1111-1111-111111111111",
    });
    expect(v.ok).toBe(false);
  });

  it("requires personId for person scope and rejects weddingId", () => {
    const bad = validateOperatorAssistantMemoryPayload({
      memoryScope: "person",
      title: "T",
      summary: "S",
      fullContent: "F",
    });
    expect(bad.ok).toBe(false);

    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "person",
      title: "T",
      summary: "S",
      fullContent: "F",
      personId: "22222222-2222-2222-2222-222222222222",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.personId).toBe("22222222-2222-2222-2222-222222222222");
      expect(v.value.weddingId).toBeNull();
    }
  });
});

describe("tryParseLlmProposedMemoryNote", () => {
  it("accepts person scope when personId is set", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "person",
      title: "x",
      summary: "y",
      fullContent: "z",
      personId: "33333333-3333-3333-3333-333333333333",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.memoryScope).toBe("person");
      expect(r.value.personId).toBe("33333333-3333-3333-3333-333333333333");
    }
  });
});
