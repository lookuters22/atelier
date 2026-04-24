/**
 * Canonical registry of V3 golden-thread stress replay fixtures (metadata only).
 * Source of truth for rows remains BATCH*_DECISION_POINTS in the batch harness modules.
 */
import {
  BATCH1_DECISION_POINTS,
  type StressReplayDecisionPoint,
  type StressReplayGapCategory,
} from "./v3StressReplayBatch1Harness.ts";
import { BATCH2_DECISION_POINTS } from "./v3StressReplayBatch2Harness.ts";
import { BATCH3_DECISION_POINTS } from "./v3StressReplayBatch3Harness.ts";

const SOURCE_BATCH1 = "supabase/functions/_shared/qa/v3StressReplayBatch1Harness.ts" as const;
const SOURCE_BATCH2 = "supabase/functions/_shared/qa/v3StressReplayBatch2Harness.ts" as const;
const SOURCE_BATCH3 = "supabase/functions/_shared/qa/v3StressReplayBatch3Harness.ts" as const;

export type V3GoldenThreadFixtureRow = {
  fixtureId: string;
  batch: 1 | 2 | 3;
  stressTest: StressReplayDecisionPoint["stressTest"];
  title: string;
  expectedProductBehavior: string;
  primaryGapIfUnmet: StressReplayGapCategory;
  sourceFile: string;
};

function mapBatchToCatalogRows(
  batch: 1 | 2 | 3,
  points: readonly StressReplayDecisionPoint[],
  sourceFile: string,
): V3GoldenThreadFixtureRow[] {
  return points.map((dp) => ({
    fixtureId: dp.id,
    batch,
    stressTest: dp.stressTest,
    title: dp.title,
    expectedProductBehavior: dp.expectedProductBehavior,
    primaryGapIfUnmet: dp.primaryGapIfUnmet,
    sourceFile,
  }));
}

export const V3_GOLDEN_THREAD_FIXTURES: readonly V3GoldenThreadFixtureRow[] = [
  ...mapBatchToCatalogRows(1, BATCH1_DECISION_POINTS, SOURCE_BATCH1),
  ...mapBatchToCatalogRows(2, BATCH2_DECISION_POINTS, SOURCE_BATCH2),
  ...mapBatchToCatalogRows(3, BATCH3_DECISION_POINTS, SOURCE_BATCH3),
];

export const V3_GOLDEN_THREAD_FIXTURE_COUNT = V3_GOLDEN_THREAD_FIXTURES.length;

const stressTestOrder: readonly StressReplayDecisionPoint["stressTest"][] = [1, 2, 3, 4, 5, 6, 7, 8];

const batchOrder = [1, 2, 3] as const;

/** Distinct stress test numbers present in {@link V3_GOLDEN_THREAD_FIXTURES}, sorted ascending. */
export const V3_GOLDEN_THREAD_STRESS_TESTS_COVERED: readonly StressReplayDecisionPoint["stressTest"][] =
  stressTestOrder.filter((n) => V3_GOLDEN_THREAD_FIXTURES.some((f) => f.stressTest === n));

/** Distinct batch numbers present in {@link V3_GOLDEN_THREAD_FIXTURES}, sorted ascending. */
export const V3_GOLDEN_THREAD_BATCHES_COVERED: readonly (1 | 2 | 3)[] = batchOrder.filter((b) =>
  V3_GOLDEN_THREAD_FIXTURES.some((f) => f.batch === b),
);
