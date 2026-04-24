/**
 * Derive effective readiness / milestone state for P14/P18-style gaps (timeline, questionnaire, etc.).
 */
import type {
  V3ReadinessMilestoneKey,
  V3ThreadWorkflowReadinessV1,
  V3ThreadWorkflowTimeline,
  V3ThreadWorkflowV1,
} from "./v3ThreadWorkflowTypes.ts";
import {
  parseV3ThreadWorkflowV1,
  V3_READINESS_MILESTONE_KEYS,
} from "./v3ThreadWorkflowTypes.ts";

export const READINESS_OVERDUE_TASK_TITLE: Record<V3ReadinessMilestoneKey, string> = {
  questionnaire: "[V3] Overdue: client questionnaire / intake form",
  consultation: "[V3] Overdue: consultation not booked",
  timeline: "[V3] Overdue: timeline or run-of-show not received",
  pre_event_briefing: "[V3] Overdue: pre-event briefing",
};

function legacyTimelineReceived(tl: V3ThreadWorkflowTimeline | undefined): boolean {
  if (!tl) return false;
  if (tl.received_at && String(tl.received_at).trim()) return true;
  if (tl.suppressed === true) return true;
  return false;
}

/**
 * Whether this milestone is satisfied (complete / waived / N/A, or legacy timeline receipt).
 */
export function readinessMilestoneIsSatisfied(
  key: V3ReadinessMilestoneKey,
  workflow: V3ThreadWorkflowV1,
): boolean {
  const r = workflow.readiness?.[key];
  if (r?.status === "complete" || r?.status === "waived" || r?.status === "not_applicable") {
    return true;
  }
  if (key === "timeline" && legacyTimelineReceived(workflow.timeline)) {
    return true;
  }
  return false;
}

export type ReadinessEffectiveKind = "satisfied" | "pending_no_due" | "pending_upcoming" | "overdue";

export function readinessMilestoneEffective(
  key: V3ReadinessMilestoneKey,
  workflow: V3ThreadWorkflowV1,
  nowMs: number,
): { kind: ReadinessEffectiveKind; dueAtMs: number | null } {
  if (readinessMilestoneIsSatisfied(key, workflow)) {
    return { kind: "satisfied", dueAtMs: null };
  }
  const r = workflow.readiness?.[key];
  if (!r || r.status !== "pending") {
    return { kind: "satisfied", dueAtMs: null };
  }
  const dueRaw = r.due_at?.trim();
  if (!dueRaw) {
    return { kind: "pending_no_due", dueAtMs: null };
  }
  const dueMs = Date.parse(dueRaw);
  if (Number.isNaN(dueMs)) {
    return { kind: "pending_no_due", dueAtMs: null };
  }
  if (dueMs <= nowMs) {
    return { kind: "overdue", dueAtMs: dueMs };
  }
  return { kind: "pending_upcoming", dueAtMs: dueMs };
}

/** ISO times for `next_due_at`: pending milestones with due_at and no overdue task yet. */
export function collectReadinessDueAtIsoTimes(workflow: V3ThreadWorkflowV1): string[] {
  const out: string[] = [];
  const r = workflow.readiness;
  if (!r) return out;
  for (const key of V3_READINESS_MILESTONE_KEYS) {
    if (readinessMilestoneIsSatisfied(key, workflow)) continue;
    const m = r[key];
    if (!m || m.status !== "pending") continue;
    const due = m.due_at?.trim();
    if (!due || m.overdue_nudge_task_created_at) continue;
    if (!Number.isNaN(Date.parse(due))) {
      out.push(due);
    }
  }
  return out;
}

const READINESS_LABEL: Record<V3ReadinessMilestoneKey, string> = {
  questionnaire: "Questionnaire / intake form",
  consultation: "Consultation booking",
  timeline: "Timeline or run-of-show",
  pre_event_briefing: "Pre-event briefing",
};

/**
 * Grounded lines for `fetchAssistantThreadQueueExplanation` / operator_lookup_thread_queue.
 */
export function formatReadinessNotesForQueueExplanation(
  workflowRaw: unknown,
  nowMs: number = Date.now(),
): string[] {
  const workflow = parseV3ThreadWorkflowV1(workflowRaw);
  if (!workflow.readiness && !workflow.timeline) return [];
  const lines: string[] = [];
  for (const key of V3_READINESS_MILESTONE_KEYS) {
    const eff = readinessMilestoneEffective(key, workflow, nowMs);
    if (eff.kind === "satisfied") continue;
    const label = READINESS_LABEL[key];
    if (eff.kind === "overdue") {
      lines.push(
        `**Readiness (workflow):** ${label} is **overdue** (due ${new Date(eff.dueAtMs!).toISOString().slice(0, 10)}).`,
      );
    } else if (eff.kind === "pending_upcoming") {
      lines.push(
        `**Readiness (workflow):** ${label} **pending** — target ${new Date(eff.dueAtMs!).toISOString().slice(0, 10)}.`,
      );
    } else if (eff.kind === "pending_no_due") {
      lines.push(`**Readiness (workflow):** ${label} **pending** — no due date on milestone.`);
    }
  }
  return lines;
}

export function mergeReadinessBlocks(
  base: V3ThreadWorkflowReadinessV1 | undefined,
  patch: V3ThreadWorkflowReadinessV1 | undefined,
): V3ThreadWorkflowReadinessV1 | undefined {
  if (!patch) return base;
  if (!base) return patch;
  const out: V3ThreadWorkflowReadinessV1 = { ...base };
  for (const k of V3_READINESS_MILESTONE_KEYS) {
    const p = patch[k];
    if (p) {
      out[k] = { ...base[k], ...p };
    }
  }
  const hasAny = V3_READINESS_MILESTONE_KEYS.some((k) => out[k] != null);
  return hasAny ? out : undefined;
}
