import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "../a5MiniClassifierBudget.ts";
import {
  INTAKE_EXTRACTION_MAX_USER_MESSAGE_CHARS,
  truncateIntakeExtractionToolOutput,
  truncateIntakeExtractionUserMessage,
} from "./intakeExtractionA5Budget.ts";

describe("intakeExtractionA5Budget", () => {
  it("caps user message", () => {
    const long = "u".repeat(INTAKE_EXTRACTION_MAX_USER_MESSAGE_CHARS + 50);
    const out = truncateIntakeExtractionUserMessage(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps tool output", () => {
    const long = JSON.stringify({ availability: "z".repeat(20000) });
    const out = truncateIntakeExtractionToolOutput(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
