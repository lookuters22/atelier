/**
 * A4 — structured latency / outcome logs for user-triggered Edge paths (grep `a4_edge_op_latency_v1`).
 * Evidence for async (A3) follow-ups without queueing speculatively.
 */

export type A4EdgeOpLatencyV1 = {
  type: "a4_edge_op_latency_v1";
  edge: string;
  /** Logical action / branch (e.g. approve, approve_group, gmail_list_labels_cache). */
  action: string;
  ok: boolean;
  duration_ms: number;
  photographer_id?: string;
  http_status?: number;
  outcome?: string;
};

export function logA4EdgeOpLatencyV1(
  payload: Omit<A4EdgeOpLatencyV1, "type"> & Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      type: "a4_edge_op_latency_v1" as const,
      ...payload,
    }),
  );
}
