import { describe, expect, it, vi } from "vitest";
import { extractAuthorizedCaseExceptionPayloadFromOperatorText } from "./extractAuthorizedCaseExceptionPayloadFromOperatorText.ts";

describe("extractAuthorizedCaseExceptionPayloadFromOperatorText", () => {
  it("returns applies_policy_override false without fetch when all text fields are empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await extractAuthorizedCaseExceptionPayloadFromOperatorText({
      questionBody: "",
      photographerReply: "",
      resolutionSummary: "",
      actionKey: "travel_fee",
    });
    expect(out).toEqual({ ok: true, applies_policy_override: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns applies_policy_override false without fetch when all text fields are whitespace only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await extractAuthorizedCaseExceptionPayloadFromOperatorText({
      questionBody: " \n\t",
      photographerReply: "   ",
      resolutionSummary: "",
      actionKey: "k",
    });
    expect(out).toEqual({ ok: true, applies_policy_override: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
