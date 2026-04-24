import { describe, expect, it } from "vitest";
import {
  AGENCY_CC_LOCK_SKIP_REASON,
  isWeddingAutomationPaused,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "./weddingAutomationPause.ts";

describe("weddingAutomationPause constants", () => {
  it("exposes stable skip_reason tokens for logs and step payloads", () => {
    expect(WEDDING_AUTOMATION_PAUSED_SKIP_REASON).toBe("wedding_automation_paused");
    expect(AGENCY_CC_LOCK_SKIP_REASON).toBe("agency_cc_lock");
  });
});

describe("isWeddingAutomationPaused", () => {
  it("is false when wedding is null/undefined", () => {
    expect(isWeddingAutomationPaused(null)).toBe(false);
    expect(isWeddingAutomationPaused(undefined)).toBe(false);
  });

  it("is false when both flags are false, unset, or null", () => {
    expect(isWeddingAutomationPaused({})).toBe(false);
    expect(isWeddingAutomationPaused({ compassion_pause: false, strategic_pause: false })).toBe(
      false,
    );
    expect(isWeddingAutomationPaused({ compassion_pause: null, strategic_pause: null })).toBe(
      false,
    );
  });

  it("is true when compassion_pause is strictly true", () => {
    expect(isWeddingAutomationPaused({ compassion_pause: true })).toBe(true);
    expect(
      isWeddingAutomationPaused({ compassion_pause: true, strategic_pause: false }),
    ).toBe(true);
  });

  it("is true when strategic_pause is strictly true", () => {
    expect(isWeddingAutomationPaused({ strategic_pause: true })).toBe(true);
    expect(
      isWeddingAutomationPaused({ compassion_pause: false, strategic_pause: true }),
    ).toBe(true);
  });
});
