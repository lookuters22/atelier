import { describe, expect, it } from "vitest";
import { validateOperatorAssistantMemorySupersessionPayload } from "./validateOperatorAssistantMemorySupersessionPayload.ts";

describe("validateOperatorAssistantMemorySupersessionPayload", () => {
  it("accepts two distinct UUIDs", () => {
    const r = validateOperatorAssistantMemorySupersessionPayload({
      supersedingMemoryId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      supersededMemoryId: "11111111-2222-4333-8444-555555555555",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.supersedingMemoryId).toBe("aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee");
    }
  });

  it("rejects non-UUID strings", () => {
    const r = validateOperatorAssistantMemorySupersessionPayload({
      supersedingMemoryId: "not-a-uuid",
      supersededMemoryId: "11111111-2222-4333-8444-555555555555",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects identical ids", () => {
    const id = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const r = validateOperatorAssistantMemorySupersessionPayload({
      supersedingMemoryId: id,
      supersededMemoryId: id,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-object body", () => {
    expect(validateOperatorAssistantMemorySupersessionPayload(null).ok).toBe(false);
  });
});
