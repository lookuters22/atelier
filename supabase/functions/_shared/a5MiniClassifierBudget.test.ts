import { describe, expect, it } from "vitest";
import {
  A5_MINI_CLASSIFIER_TRUNCATE_MARKER,
  truncateA5ClassifierField,
} from "./a5MiniClassifierBudget.ts";

describe("truncateA5ClassifierField", () => {
  it("returns trimmed text when under max", () => {
    expect(truncateA5ClassifierField("  hello  ", 100)).toBe("hello");
  });

  it("truncates with shared A5 marker when over max", () => {
    const long = "a".repeat(50);
    const out = truncateA5ClassifierField(long, 20);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
    expect(out.startsWith("a".repeat(20))).toBe(true);
  });
});
