import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  TRIAGE_MAX_USER_MESSAGE_CHARS,
  truncateTriageUserMessage,
} from "./triageA5Budget.ts";

describe("triageA5Budget", () => {
  it("caps user message for classification", () => {
    const long = "t".repeat(TRIAGE_MAX_USER_MESSAGE_CHARS + 50);
    const out = truncateTriageUserMessage(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
