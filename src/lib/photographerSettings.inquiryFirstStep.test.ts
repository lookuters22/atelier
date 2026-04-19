import { describe, expect, it } from "vitest";
import { normalizeInquiryFirstStepStyle } from "./inquiryFirstStepStyle.ts";
import { parsePhotographerSettings } from "./photographerSettings.ts";

describe("photographer settings — inquiry_first_step_style", () => {
  it("parsePhotographerSettings preserves no_call_push", () => {
    const parsed = parsePhotographerSettings({ inquiry_first_step_style: "no_call_push" });
    expect(parsed.inquiry_first_step_style).toBe("no_call_push");
  });

  it("parsePhotographerSettings omits key when absent", () => {
    const parsed = parsePhotographerSettings({ studio_name: "X" });
    expect(parsed.inquiry_first_step_style).toBeUndefined();
  });

  it("runtime normalize matches buildDecisionContext: stored → same; missing → proactive_call", () => {
    const stored = parsePhotographerSettings({ inquiry_first_step_style: "no_call_push" });
    expect(normalizeInquiryFirstStepStyle(stored.inquiry_first_step_style)).toBe("no_call_push");

    const empty = parsePhotographerSettings({});
    expect(normalizeInquiryFirstStepStyle(empty.inquiry_first_step_style)).toBe("proactive_call");
  });
});
