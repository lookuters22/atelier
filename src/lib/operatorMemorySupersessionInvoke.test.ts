import { describe, expect, it } from "vitest";
import { buildSupersedeOperatorAssistantMemoryInvokeBody } from "./operatorMemorySupersessionInvoke.ts";

describe("buildSupersedeOperatorAssistantMemoryInvokeBody", () => {
  it("maps newer id to supersedingMemoryId and older to supersededMemoryId", () => {
    const newer = "11111111-1111-1111-1111-111111111111";
    const older = "22222222-2222-2222-2222-222222222222";
    const body = buildSupersedeOperatorAssistantMemoryInvokeBody(newer, older);
    expect(body).toEqual({
      supersedingMemoryId: newer,
      supersededMemoryId: older,
    });
    expect(Object.keys(body).sort()).toEqual(["supersededMemoryId", "supersedingMemoryId"]);
  });
});
