import type { V3ThreadWorkflowV1 } from "./v3ThreadWorkflowTypes.ts";
import { emptyV3ThreadWorkflowV1, parseV3ThreadWorkflowV1 } from "./v3ThreadWorkflowTypes.ts";
import { collectReadinessDueAtIsoTimes, mergeReadinessBlocks } from "./v3ThreadWorkflowReadiness.ts";

function mergeTimeline(
  base: V3ThreadWorkflowV1["timeline"],
  patch: V3ThreadWorkflowV1["timeline"],
): V3ThreadWorkflowV1["timeline"] {
  if (!patch) return base;
  return { ...base, ...patch };
}

function mergePaymentWire(
  base: V3ThreadWorkflowV1["payment_wire"],
  patch: V3ThreadWorkflowV1["payment_wire"],
): V3ThreadWorkflowV1["payment_wire"] {
  if (!patch) return base;
  return { ...base, ...patch };
}

function mergeStalled(
  base: V3ThreadWorkflowV1["stalled_inquiry"],
  patch: V3ThreadWorkflowV1["stalled_inquiry"],
): V3ThreadWorkflowV1["stalled_inquiry"] {
  if (!patch) return base;
  return { ...base, ...patch };
}

/** Deep-merge known keys; patch wins for overlapping fields. */
export function mergeV3ThreadWorkflow(
  existing: unknown,
  patch: Partial<V3ThreadWorkflowV1>,
): V3ThreadWorkflowV1 {
  const b = parseV3ThreadWorkflowV1(existing);
  return {
    v: 1,
    timeline: mergeTimeline(b.timeline, patch.timeline),
    payment_wire: mergePaymentWire(b.payment_wire, patch.payment_wire),
    stalled_inquiry: mergeStalled(b.stalled_inquiry, patch.stalled_inquiry),
    readiness: mergeReadinessBlocks(b.readiness, patch.readiness),
  };
}

/** Earliest pending chase/nudge due for sweep index (min of outstanding ISO times). */
export function computeV3ThreadWorkflowNextDueAt(workflow: V3ThreadWorkflowV1): string | null {
  const candidates: string[] = [];
  const pw = workflow.payment_wire;
  if (pw?.chase_due_at && !pw.chase_task_created_at) {
    candidates.push(pw.chase_due_at);
  }
  const st = workflow.stalled_inquiry;
  if (st?.nudge_due_at && !st.nudge_task_created_at) {
    candidates.push(st.nudge_due_at);
  }
  candidates.push(...collectReadinessDueAtIsoTimes(workflow));
  if (candidates.length === 0) return null;
  const times = candidates.map((iso) => Date.parse(iso)).filter((n) => !Number.isNaN(n));
  if (times.length === 0) return null;
  return new Date(Math.min(...times)).toISOString();
}

export { emptyV3ThreadWorkflowV1 };
