/**
 * Legacy app-layer finalize (writeback then UPDATE escalation). Operator flow uses
 * `completeEscalationResolutionAtomic` RPCs instead — durable artifact + escalation row in one transaction.
 * Retained for tests and any non-DB callers.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { EscalationLearningOutcome } from "./classifyEscalationLearningOutcome.ts";
import type { WritebackEscalationLearningResult } from "./completeEscalationResolutionAtomic.ts";

export type FinalizeEscalationWithWritebackParams = {
  photographerId: string;
  escalationId: string;
  learningOutcome: EscalationLearningOutcome;
  writeback: WritebackEscalationLearningResult;
};

export async function finalizeEscalationWithWritebackResult(
  supabase: SupabaseClient,
  p: FinalizeEscalationWithWritebackParams,
): Promise<void> {
  const now = new Date().toISOString();
  const base = {
    status: "answered" as const,
    resolved_at: now,
    resolved_decision_mode: "auto" as const,
    resolution_text: null,
    learning_outcome: p.learningOutcome,
  };

  let patch: Record<string, unknown>;

  switch (p.writeback.branch) {
    case "authorized_case_exception":
      patch = {
        ...base,
        resolution_storage_target: "authorized_case_exceptions",
        playbook_rule_id: p.writeback.playbookRuleId,
        promote_to_playbook: false,
      };
      break;
    case "document":
      patch = {
        ...base,
        resolution_storage_target: "documents",
        playbook_rule_id: null,
        promote_to_playbook: false,
      };
      break;
    case "playbook":
      patch = {
        ...base,
        resolution_storage_target: "playbook_rules",
        playbook_rule_id: p.writeback.playbookRuleId,
        promote_to_playbook: true,
      };
      break;
    case "memory":
      patch = {
        ...base,
        resolution_storage_target: "memories",
        playbook_rule_id: null,
        promote_to_playbook: false,
      };
      break;
  }

  const { error } = await supabase
    .from("escalation_requests")
    .update(patch)
    .eq("id", p.escalationId)
    .eq("photographer_id", p.photographerId);

  if (error) throw new Error(`escalation_requests finalize after writeback: ${error.message}`);
}
