/**
 * One-shot sweep: rows with next_due_at <= now, respecting operator hold + wedding pause.
 * Creates `tasks` rows and marks workflow task_created_at fields.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  WEDDING_PAUSE_STATE_DB_ERROR,
  WEDDING_PAUSE_STATE_UNREADABLE,
} from "../fetchWeddingPauseFlags.ts";
import { isThreadV3OperatorHold } from "../operator/threadV3OperatorHold.ts";
import {
  AGENCY_CC_LOCK_SKIP_REASON,
  isWeddingAutomationPaused,
  logAutomationPauseObservation,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "../weddingAutomationPause.ts";
import {
  computeV3ThreadWorkflowNextDueAt,
  mergeV3ThreadWorkflow,
} from "./mergeV3ThreadWorkflow.ts";
import {
  READINESS_OVERDUE_TASK_TITLE,
  readinessMilestoneEffective,
} from "./v3ThreadWorkflowReadiness.ts";
import type { V3ThreadWorkflowV1 } from "./v3ThreadWorkflowTypes.ts";
import { parseV3ThreadWorkflowV1, V3_READINESS_MILESTONE_KEYS } from "./v3ThreadWorkflowTypes.ts";

/**
 * When a row is due but skipped (operator hold / wedding pause), bump `next_due_at` forward so the
 * same rows do not repeatedly fill the sweep `limit` and starve other actionable threads.
 * Does not create tasks; reversible — workflow JSON is unchanged.
 */
export const V3_WORKFLOW_SWEEP_SKIP_DEFER_MS = 60 * 60 * 1000;

export function computeDeferredNextDueAfterSweepSkip(nowMs: number): string {
  return new Date(nowMs + V3_WORKFLOW_SWEEP_SKIP_DEFER_MS).toISOString();
}

async function deferV3WorkflowDueRowAfterSweepSkip(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
  nowIso: string,
  nowMs: number,
): Promise<void> {
  const nextDue = computeDeferredNextDueAfterSweepSkip(nowMs);
  const { error } = await supabase
    .from("v3_thread_workflow_state")
    .update({
      next_due_at: nextDue,
      updated_at: nowIso,
    })
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId);
  if (error) throw new Error(`v3_thread_workflow_state sweep defer (skip): ${error.message}`);
}

export type V3WorkflowSweepRow = {
  photographer_id: string;
  thread_id: string;
  wedding_id: string | null;
  workflow: unknown;
  next_due_at: string | null;
};

export type V3WorkflowSweepResult = {
  processed: number;
  skippedHold: number;
  skippedPaused: number;
  tasksCreated: number;
  errors: string[];
};

/** Non-null skip_reason means defer this sweep row (life-event pause or agency_cc_lock — same as pre-v1 behavior). */
async function getWeddingSweepDeferSkipReason(
  supabase: SupabaseClient,
  weddingId: string | null,
  photographerId: string,
): Promise<string | null> {
  if (!weddingId) return null;
  const { data, error } = await supabase
    .from("weddings")
    .select("compassion_pause, strategic_pause, agency_cc_lock")
    .eq("id", weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    logAutomationPauseObservation({
      observation_type: "v3_thread_workflow_sweep_pause_read_failed",
      skip_reason: WEDDING_PAUSE_STATE_DB_ERROR,
      inngest_function_id: "v3-thread-workflow-due-sweep",
      photographer_id: photographerId,
      wedding_id: weddingId,
    });
    return WEDDING_PAUSE_STATE_DB_ERROR;
  }
  if (!data) {
    logAutomationPauseObservation({
      observation_type: "v3_thread_workflow_sweep_pause_read_failed",
      skip_reason: WEDDING_PAUSE_STATE_UNREADABLE,
      inngest_function_id: "v3-thread-workflow-due-sweep",
      photographer_id: photographerId,
      wedding_id: weddingId,
    });
    return WEDDING_PAUSE_STATE_UNREADABLE;
  }
  if (isWeddingAutomationPaused(data)) return WEDDING_AUTOMATION_PAUSED_SKIP_REASON;
  if (data?.agency_cc_lock === true) return AGENCY_CC_LOCK_SKIP_REASON;
  return null;
}

export async function runV3ThreadWorkflowDueSweep(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<V3WorkflowSweepResult> {
  const limit = options?.limit ?? 50;
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: rows, error: qErr } = await supabase
    .from("v3_thread_workflow_state")
    .select("photographer_id, thread_id, wedding_id, workflow, next_due_at")
    .lte("next_due_at", nowIso)
    .not("next_due_at", "is", null)
    .order("next_due_at", { ascending: true })
    .order("thread_id", { ascending: true })
    .limit(limit);

  if (qErr) throw new Error(`v3_thread_workflow_state sweep query: ${qErr.message}`);

  const result: V3WorkflowSweepResult = {
    processed: 0,
    skippedHold: 0,
    skippedPaused: 0,
    tasksCreated: 0,
    errors: [],
  };

  for (const row of rows ?? []) {
    const photographerId = row.photographer_id as string;
    const threadId = row.thread_id as string;
    const weddingId = (row.wedding_id as string | null) ?? null;

    try {
      const hold = await isThreadV3OperatorHold(supabase, photographerId, threadId);
      if (hold) {
        result.skippedHold += 1;
        await deferV3WorkflowDueRowAfterSweepSkip(
          supabase,
          photographerId,
          threadId,
          nowIso,
          now.getTime(),
        );
        continue;
      }

      const sweepSkipReason = await getWeddingSweepDeferSkipReason(supabase, weddingId, photographerId);
      if (sweepSkipReason) {
        result.skippedPaused += 1;
        logAutomationPauseObservation({
          observation_type: "v3_thread_workflow_sweep_row_deferred",
          skip_reason: sweepSkipReason,
          inngest_function_id: "v3-thread-workflow-due-sweep",
          photographer_id: photographerId,
          thread_id: threadId,
          wedding_id: weddingId,
        });
        await deferV3WorkflowDueRowAfterSweepSkip(
          supabase,
          photographerId,
          threadId,
          nowIso,
          now.getTime(),
        );
        continue;
      }

      let wf = parseV3ThreadWorkflowV1(row.workflow);
      const nowMs = now.getTime();
      let workflowMutated = false;

      const pw = wf.payment_wire;
      if (
        pw?.chase_due_at &&
        !pw.chase_task_created_at &&
        Date.parse(pw.chase_due_at) <= nowMs
      ) {
        const { error: taskErr } = await supabase.from("tasks").insert({
          photographer_id: photographerId,
          wedding_id: weddingId,
          thread_id: threadId,
          title: "[V3] Wire transfer follow-up check",
          due_date: nowIso,
          status: "open",
        });
        if (taskErr) throw new Error(`tasks insert wire: ${taskErr.message}`);
        result.tasksCreated += 1;
        wf = mergeV3ThreadWorkflow(wf, {
          payment_wire: { chase_task_created_at: nowIso },
        });
        workflowMutated = true;
      }

      const st = wf.stalled_inquiry;
      if (
        st?.nudge_due_at &&
        !st.nudge_task_created_at &&
        Date.parse(st.nudge_due_at) <= nowMs
      ) {
        const { error: taskErr } = await supabase.from("tasks").insert({
          photographer_id: photographerId,
          wedding_id: weddingId,
          thread_id: threadId,
          title: "[V3] Stalled communication nudge",
          due_date: nowIso,
          status: "open",
        });
        if (taskErr) throw new Error(`tasks insert stalled: ${taskErr.message}`);
        result.tasksCreated += 1;
        wf = mergeV3ThreadWorkflow(wf, {
          stalled_inquiry: { nudge_task_created_at: nowIso },
        });
        workflowMutated = true;
      }

      for (const milestoneKey of V3_READINESS_MILESTONE_KEYS) {
        const eff = readinessMilestoneEffective(milestoneKey, wf, nowMs);
        if (eff.kind !== "overdue") continue;
        const rm = wf.readiness?.[milestoneKey];
        if (!rm || rm.overdue_nudge_task_created_at) continue;
        const title = READINESS_OVERDUE_TASK_TITLE[milestoneKey];
        const { error: taskErr } = await supabase.from("tasks").insert({
          photographer_id: photographerId,
          wedding_id: weddingId,
          thread_id: threadId,
          title,
          due_date: nowIso,
          status: "open",
        });
        if (taskErr) throw new Error(`tasks insert readiness ${milestoneKey}: ${taskErr.message}`);
        result.tasksCreated += 1;
        wf = mergeV3ThreadWorkflow(wf, {
          readiness: { [milestoneKey]: { overdue_nudge_task_created_at: nowIso } },
        });
        workflowMutated = true;
      }

      if (workflowMutated) {
        const nextDue = computeV3ThreadWorkflowNextDueAt(wf);
        const { error: upErr } = await supabase
          .from("v3_thread_workflow_state")
          .update({
            workflow: wf as unknown as Record<string, unknown>,
            next_due_at: nextDue,
            updated_at: nowIso,
          })
          .eq("photographer_id", photographerId)
          .eq("thread_id", threadId);
        if (upErr) throw new Error(`v3_thread_workflow_state update: ${upErr.message}`);
      } else {
        const wfStale = parseV3ThreadWorkflowV1(row.workflow);
        const recomputed = computeV3ThreadWorkflowNextDueAt(wfStale);
        const rowNext = row.next_due_at as string | null;
        if (recomputed !== rowNext && (recomputed !== null || rowNext !== null)) {
          const { error: upErr } = await supabase
            .from("v3_thread_workflow_state")
            .update({
              next_due_at: recomputed,
              updated_at: nowIso,
            })
            .eq("photographer_id", photographerId)
            .eq("thread_id", threadId);
          if (upErr) throw new Error(`v3_thread_workflow_state next_due reconcile: ${upErr.message}`);
        }
      }

      result.processed += 1;
    } catch (e) {
      result.errors.push(
        `${threadId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
