/**
 * Phase 7 Step 7A — Booking phase: contract follow-up after `contract_out` (3-day sleep).
 *
 * Listens for `crm/stage.updated`; sleeps 3 days, re-verifies wedding + milestones with tenant isolation,
 * then drafts a contract check-in via persona into `drafts` (pending_approval).
 *
 * Phase 10 Step 10B (slice): after the sleep boundary, re-query includes pause flags; outbound draft is skipped if paused.
 *
 * QA HACK: sleep duration is temporarily "1m" (search below). Revert to "3d" after Cloud E2E verification.
 */
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import { buildDecisionContext } from "../../_shared/context/buildDecisionContext.ts";
import {
  WEDDING_PAUSE_STATE_DB_ERROR,
  WEDDING_PAUSE_STATE_UNREADABLE,
} from "../../_shared/fetchWeddingPauseFlags.ts";
import { inngest } from "../../_shared/inngest.ts";
import { isThreadV3OperatorHold } from "../../_shared/operator/threadV3OperatorHold.ts";
import { draftPersonaResponse } from "../../_shared/persona/personaAgent.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  AGENCY_CC_LOCK_SKIP_REASON,
  isWeddingAutomationPaused,
  logAutomationPauseObservation,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "../../_shared/weddingAutomationPause.ts";

export const contractFollowupFunction = inngest.createFunction(
  {
    id: "milestone-contract-followup",
    name: "Milestone — 3d contract check-in (contract_out)",
  },
  { event: "crm/stage.updated" },
  async ({ event, step }) => {
    const { weddingId, photographerId, newStage } = event.data;

    if (newStage !== "contract_out") {
      return { skipped: true as const, reason: "gate_not_contract_out" };
    }

    // QA HACK: revert to "3d" after E2E verification (Inngest Cloud cannot fast-forward sleeps).
    await step.sleep("wait-3-days-for-contract", "1m");

    const verify = await step.run("verify-contract-followup-state", async () => {
      const { data: wedding, error: wErr } = await supabaseAdmin
        .from("weddings")
        .select(
          "id, stage, couple_names, compassion_pause, strategic_pause, agency_cc_lock",
        )
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (wErr) throw new Error(`weddings: ${wErr.message}`);
      if (!wedding) {
        return { proceed: false as const, reason: "wedding_missing" as const };
      }

      if (isWeddingAutomationPaused(wedding)) {
        return { proceed: false as const, reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON };
      }
      if (wedding.agency_cc_lock === true) {
        return { proceed: false as const, reason: AGENCY_CC_LOCK_SKIP_REASON };
      }

      const { data: milestone, error: mErr } = await supabaseAdmin
        .from("wedding_milestones")
        .select("retainer_paid")
        .eq("wedding_id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (mErr) throw new Error(`wedding_milestones: ${mErr.message}`);

      const stillContractOut = wedding.stage === "contract_out";
      const retainerPaid = milestone?.retainer_paid === true;

      if (!stillContractOut || retainerPaid) {
        return {
          proceed: false as const,
          reason: retainerPaid ? ("retainer_paid" as const) : ("stage_moved" as const),
        };
      }

      return {
        proceed: true as const,
        coupleNames: (wedding.couple_names as string) ?? "",
      };
    });

    if (!verify.proceed) {
      return { skipped: true as const, reason: verify.reason };
    }

    const threadId = await step.run("resolve-thread-for-drafts", async () => {
      const { data, error } = await supabaseAdmin
        .from("threads")
        .select("id")
        .eq("wedding_id", weddingId)
        .eq("photographer_id", photographerId)
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`resolve-thread: ${error.message}`);
      return (data?.id as string) ?? null;
    });

    if (!threadId) {
      return { skipped: true as const, reason: "no_thread_for_wedding" };
    }

    const onHold = await step.run("check-v3-operator-hold", async () =>
      isThreadV3OperatorHold(supabaseAdmin, photographerId, threadId),
    );
    if (onHold) {
      return { skipped: true as const, reason: "v3_operator_hold" as const };
    }

    await step.run("draft-contract-check-in", async () => {
      const { data: weddingFresh, error: freshErr } = await supabaseAdmin
        .from("weddings")
        .select("compassion_pause, strategic_pause, agency_cc_lock")
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (freshErr) {
        logAutomationPauseObservation({
          observation_type: "inngest_worker_skipped",
          skip_reason: WEDDING_PAUSE_STATE_DB_ERROR,
          inngest_function_id: "milestone-contract-followup",
          wedding_id: weddingId,
          photographer_id: photographerId,
          gate: "draft_pre_insert",
        });
        return { drafted: false as const, reason: WEDDING_PAUSE_STATE_DB_ERROR };
      }
      if (!weddingFresh) {
        logAutomationPauseObservation({
          observation_type: "inngest_worker_skipped",
          skip_reason: WEDDING_PAUSE_STATE_UNREADABLE,
          inngest_function_id: "milestone-contract-followup",
          wedding_id: weddingId,
          photographer_id: photographerId,
          gate: "draft_pre_insert",
        });
        return { drafted: false as const, reason: WEDDING_PAUSE_STATE_UNREADABLE };
      }
      if (isWeddingAutomationPaused(weddingFresh)) {
        logAutomationPauseObservation({
          observation_type: "inngest_worker_skipped",
          skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
          inngest_function_id: "milestone-contract-followup",
          wedding_id: weddingId,
          photographer_id: photographerId,
          gate: "draft_pre_insert",
        });
        return { drafted: false as const, reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON };
      }
      if (weddingFresh.agency_cc_lock === true) {
        return { drafted: false as const, reason: AGENCY_CC_LOCK_SKIP_REASON };
      }

      /** Contract object from the shared builder only — no ad hoc context assembly. */
      const decisionContext: DecisionContext = await buildDecisionContext(
        supabaseAdmin,
        photographerId,
        weddingId,
        threadId,
        "web",
        "",
      );

      const facts = [
        "OUTREACH TYPE: Gentle follow-up after the contract was sent (stage contract_out).",
        verify.coupleNames ? `Couple: ${verify.coupleNames}` : "",
        "Draft a polite, concise check-in asking if they have any questions about the agreement or need anything clarified.",
        "Do not pressure them to sign; offer help. Do not invent terms, amounts, or deadlines not in context.",
      ]
        .filter(Boolean)
        .join("\n");

      const body = await draftPersonaResponse(decisionContext, facts);

      const { error } = await supabaseAdmin.from("drafts").insert({
        photographer_id: photographerId,
        thread_id: threadId,
        status: "pending_approval",
        body,
        instruction_history: [
          {
            step: "milestone_contract_followup_3d",
            wedding_id: weddingId,
          },
        ],
      });

      if (error) throw new Error(`draft insert: ${error.message}`);
      return { drafted: true as const };
    });

    return { ok: true as const };
  },
);
