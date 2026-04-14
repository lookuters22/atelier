import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  PROJECT_MANAGER_MAX_COUPLE_NAMES_FOR_TITLE_CHARS,
  PROJECT_MANAGER_MAX_TRIGGERED_BY_CHARS,
  truncateProjectManagerCoupleNamesForTitle,
  truncateProjectManagerTriggeredBy,
} from "./projectManagerA5Budget.ts";

describe("projectManagerA5Budget", () => {
  it("caps triggered_by (return metadata)", () => {
    const long = "x".repeat(PROJECT_MANAGER_MAX_TRIGGERED_BY_CHARS + 50);
    const out = truncateProjectManagerTriggeredBy(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps couple_names for task title", () => {
    const long = "n".repeat(PROJECT_MANAGER_MAX_COUPLE_NAMES_FOR_TITLE_CHARS + 50);
    const out = truncateProjectManagerCoupleNamesForTitle(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
