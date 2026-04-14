/**
 * Slice 1 production readiness: structured one-line logs for model invocations (cost / duplicate-call accounting).
 * Uses console JSON only — no external telemetry SDK.
 */

export type ModelInvocationFields = {
  /** Logical source, e.g. operator_orchestrator, classify_escalation_learning_outcome */
  source: string;
  model: string;
  /** Narrow step name, e.g. chat_completions, escalation_resolution_bundle */
  phase: string;
  /** Optional Inngest function id or workflow label */
  workflow?: string;
  /** Correlates logs for one worker/handler execution (e.g. random UUID per run). */
  run_id?: string;
  /** Inbound event id when available (e.g. Inngest `event.id`). */
  event_id?: string;
  /** 1-based index of model calls within this run (from `createModelInvocationLogger`). */
  invocation_index?: number;
};

export type ModelInvocationLogFn = (fields: ModelInvocationFields) => void;

export function logModelInvocation(fields: ModelInvocationFields): void {
  console.log(
    JSON.stringify({
      type: "model_invocation",
      ...fields,
    }),
  );
}

/**
 * Returns a logger that stamps `run_id`, `event_id`, `workflow` (default), and monotonic `invocation_index`
 * so concurrent runs can be grouped and "N model calls for this inbound event" can be counted from logs.
 */
export function createModelInvocationLogger(run: {
  runId: string;
  eventId?: string;
  workflow?: string;
}): ModelInvocationLogFn {
  let invocationIndex = 0;
  return (fields: ModelInvocationFields) => {
    invocationIndex += 1;
    logModelInvocation({
      ...fields,
      run_id: run.runId,
      event_id: run.eventId,
      invocation_index: invocationIndex,
      workflow: fields.workflow ?? run.workflow,
    });
  };
}
