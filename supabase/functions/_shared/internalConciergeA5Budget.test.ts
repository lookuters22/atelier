import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  INTERNAL_CONCIERGE_MAX_USER_MESSAGE_CHARS,
  truncateInternalConciergeToolOutput,
  truncateInternalConciergeUserMessage,
} from "./internalConciergeA5Budget.ts";

describe("internalConciergeA5Budget", () => {
  it("caps user message", () => {
    const long = "u".repeat(INTERNAL_CONCIERGE_MAX_USER_MESSAGE_CHARS + 50);
    const out = truncateInternalConciergeUserMessage(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps tool output", () => {
    const long = JSON.stringify({ x: "y".repeat(20000) });
    const out = truncateInternalConciergeToolOutput(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
