import { describe, expect, it } from "vitest";
import {
  V3_GOLDEN_THREAD_BATCHES_COVERED,
  V3_GOLDEN_THREAD_FIXTURES,
  V3_GOLDEN_THREAD_FIXTURE_COUNT,
  V3_GOLDEN_THREAD_STRESS_TESTS_COVERED,
} from "./v3GoldenThreadCatalog.ts";

describe("v3GoldenThreadCatalog", () => {
  it("has unique fixture ids", () => {
    const ids = V3_GOLDEN_THREAD_FIXTURES.map((f) => f.fixtureId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("meets minimum golden-thread baseline size", () => {
    expect(V3_GOLDEN_THREAD_FIXTURE_COUNT).toBeGreaterThanOrEqual(50);
    expect(V3_GOLDEN_THREAD_FIXTURES.length).toBe(V3_GOLDEN_THREAD_FIXTURE_COUNT);
  });

  it("covers stress tests 1 through 8", () => {
    expect(V3_GOLDEN_THREAD_STRESS_TESTS_COVERED).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(V3_GOLDEN_THREAD_FIXTURES.some((f) => f.stressTest === n)).toBe(true);
    }
  });

  it("covers all three stress replay batches", () => {
    expect(V3_GOLDEN_THREAD_BATCHES_COVERED).toEqual([1, 2, 3]);
    for (const b of [1, 2, 3] as const) {
      expect(V3_GOLDEN_THREAD_FIXTURES.some((f) => f.batch === b)).toBe(true);
    }
  });

  it("requires non-empty behavioral metadata on every row", () => {
    for (const row of V3_GOLDEN_THREAD_FIXTURES) {
      expect(row.expectedProductBehavior.trim().length).toBeGreaterThan(0);
      expect(row.primaryGapIfUnmet.trim().length).toBeGreaterThan(0);
      expect(row.sourceFile.trim().length).toBeGreaterThan(0);
    }
  });
});
