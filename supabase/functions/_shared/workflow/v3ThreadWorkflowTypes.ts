/**
 * V3 thread workflow JSON contract (versioned, deterministic).
 * Stored in `v3_thread_workflow_state.workflow`.
 */
export const V3_THREAD_WORKFLOW_VERSION = 1 as const;

export type V3ThreadWorkflowTimeline = {
  suppressed?: boolean;
  /** e.g. whatsapp */
  received_channel?: string;
  received_at?: string;
};

export type V3ThreadWorkflowPaymentWire = {
  /** ISO — client said they would wire */
  promised_at?: string;
  /** ISO — deterministic follow-up check (e.g. +48h from promised_at) */
  chase_due_at?: string;
  /** ISO — sweep created a tasks row */
  chase_task_created_at?: string;
};

export type V3ThreadWorkflowStalledInquiry = {
  /** ISO — client message matched stalled-follow-up pattern */
  client_marked_at?: string;
  /** ISO — deterministic nudge window (e.g. +72h) */
  nudge_due_at?: string;
  nudge_task_created_at?: string;
};

export type V3ThreadWorkflowV1 = {
  v: typeof V3_THREAD_WORKFLOW_VERSION;
  timeline?: V3ThreadWorkflowTimeline;
  payment_wire?: V3ThreadWorkflowPaymentWire;
  stalled_inquiry?: V3ThreadWorkflowStalledInquiry;
};

export function emptyV3ThreadWorkflowV1(): V3ThreadWorkflowV1 {
  return { v: V3_THREAD_WORKFLOW_VERSION };
}

export function parseV3ThreadWorkflowV1(raw: unknown): V3ThreadWorkflowV1 {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return emptyV3ThreadWorkflowV1();
  }
  const o = raw as Record<string, unknown>;
  const v = o.v === 1 ? 1 : 1;
  return {
    v,
    timeline:
      o.timeline !== undefined && typeof o.timeline === "object" && o.timeline !== null
        ? (o.timeline as V3ThreadWorkflowTimeline)
        : undefined,
    payment_wire:
      o.payment_wire !== undefined && typeof o.payment_wire === "object" && o.payment_wire !== null
        ? (o.payment_wire as V3ThreadWorkflowPaymentWire)
        : undefined,
    stalled_inquiry:
      o.stalled_inquiry !== undefined &&
      typeof o.stalled_inquiry === "object" &&
      o.stalled_inquiry !== null
        ? (o.stalled_inquiry as V3ThreadWorkflowStalledInquiry)
        : undefined,
  };
}
