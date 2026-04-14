import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  CONCIERGE_MAX_CLIENT_QUESTION_CHARS,
  truncateConciergeClientQuestion,
  truncateConciergeToolOutput,
} from "./conciergeA5Budget.ts";

describe("conciergeA5Budget", () => {
  it("caps client question", () => {
    const long = "q".repeat(CONCIERGE_MAX_CLIENT_QUESTION_CHARS + 50);
    const out = truncateConciergeClientQuestion(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps tool output", () => {
    const long = JSON.stringify({ chunks: "y".repeat(20000) });
    const out = truncateConciergeToolOutput(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
