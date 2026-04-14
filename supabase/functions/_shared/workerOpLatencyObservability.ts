/**
 * A4 — structured latency / outcome logs for Inngest workers (grep `a4_worker_op_latency_v1`).
 * Pairs with Edge `a4_edge_op_latency_v1`; measures async-heavy paths Edge timing cannot see.
 */

export type A4WorkerOpLatencyV1 = {
  type: "a4_worker_op_latency_v1";
  /** Inngest function `id` (stable grep key). */
  worker: string;
  /** Logical unit: `handler`, `guard`, `chunk`, `finalize`, `materialize_and_finalize`, etc. */
  action: string;
  ok: boolean;
  duration_ms: number;
  photographer_id?: string;
  /** Inngest retry attempt (0 = first). */
  attempt?: number;
  run_id?: string;
  outcome?: string;
  skipped_reason?: string;
  /** Short classifier for failures (e.g. not_approving, resolve_error). */
  failure_category?: string;
  import_candidate_id?: string;
  gmail_label_import_group_id?: string;
  connected_account_id?: string;
  escalation_id?: string;
  job_id?: string;
  chunk_index?: number;
  thread_id?: string;
  label_count?: number;
  empty_queue?: boolean;
  resolve_mode?: string;
  approval_total_candidates?: number;
  approval_processed?: number;
  approval_total?: number;
  remaining_candidates?: number;
  group_status_after?: string | null;
};

export function logA4WorkerOpLatencyV1(
  payload: Omit<A4WorkerOpLatencyV1, "type"> & Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      type: "a4_worker_op_latency_v1" as const,
      ...payload,
    }),
  );
}
