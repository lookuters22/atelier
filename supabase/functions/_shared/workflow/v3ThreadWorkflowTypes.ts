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

/** v1 readiness milestones (P14 timeline / logistics, P18 questionnaire — structured, not prose). */
export const V3_READINESS_MILESTONE_KEYS = [
  "questionnaire",
  "consultation",
  "timeline",
  "pre_event_briefing",
] as const;

export type V3ReadinessMilestoneKey = (typeof V3_READINESS_MILESTONE_KEYS)[number];

export type V3ReadinessMilestoneStatus = "not_applicable" | "pending" | "complete" | "waived";

export type V3ReadinessMilestoneV1 = {
  status: V3ReadinessMilestoneStatus;
  /** Target ISO — overdue when pending and now > due_at */
  due_at?: string;
  completed_at?: string;
  overdue_nudge_task_created_at?: string;
};

export type V3ThreadWorkflowReadinessV1 = {
  questionnaire?: V3ReadinessMilestoneV1;
  consultation?: V3ReadinessMilestoneV1;
  timeline?: V3ReadinessMilestoneV1;
  pre_event_briefing?: V3ReadinessMilestoneV1;
};

const READINESS_STATUS_SET = new Set<string>([
  "not_applicable",
  "pending",
  "complete",
  "waived",
]);

function parseReadinessMilestoneV1(raw: unknown): V3ReadinessMilestoneV1 | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.status !== "string" || !READINESS_STATUS_SET.has(o.status)) return undefined;
  const pick = (k: string): string | undefined =>
    typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : undefined;
  return {
    status: o.status as V3ReadinessMilestoneStatus,
    due_at: pick("due_at"),
    completed_at: pick("completed_at"),
    overdue_nudge_task_created_at: pick("overdue_nudge_task_created_at"),
  };
}

function parseThreadWorkflowReadinessV1(raw: unknown): V3ThreadWorkflowReadinessV1 | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: V3ThreadWorkflowReadinessV1 = {};
  for (const k of V3_READINESS_MILESTONE_KEYS) {
    const m = parseReadinessMilestoneV1(o[k]);
    if (m) out[k] = m;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type V3ThreadWorkflowV1 = {
  v: typeof V3_THREAD_WORKFLOW_VERSION;
  timeline?: V3ThreadWorkflowTimeline;
  payment_wire?: V3ThreadWorkflowPaymentWire;
  stalled_inquiry?: V3ThreadWorkflowStalledInquiry;
  /** Optional milestone ladder slice (questionnaire, consultation, timeline, pre-event briefing). */
  readiness?: V3ThreadWorkflowReadinessV1;
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
    readiness: parseThreadWorkflowReadinessV1(o.readiness),
  };
}
