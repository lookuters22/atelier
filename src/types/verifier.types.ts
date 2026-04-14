/**
 * ## V3 Pre-Generation Verifier (execute_v3 Step 6D — `toolVerifier`)
 *
 * **Role:** Evaluates **action allowance, intent (requested execution mode), and decision context**
 * *before* any client-facing text is generated or sent. This is distinct from the **Output Auditor**
 * (post-generation), which evaluates the **final text payload** (e.g. planner-private leakage, tone).
 *
 * **Truth hierarchy:** `playbook_rules` remain primary structured policy. Case memory and global
 * knowledge contribute only bounded **metadata** to this gate (ids/types/counts) — never raw excerpts in
 * the verifier path — and do not override playbook. Only future explicit authorized-exception machinery
 * may narrow policy for a case.
 */

/** Every reason emitted by the pre-generation verifier; closed union — do not use open `string` for violations. */
export const VERIFIER_REASON_CODES = {
  /** Policy gate evaluated; autonomous send path is allowed for this turn (no blocking reason). */
  SAFE: "V3_VERIFIER_SAFE",
  BROADCAST_HIGH_BLOCKS_AUTO: "V3_VERIFIER_BROADCAST_HIGH_BLOCKS_AUTO",
  OPEN_ESCALATION_BLOCKS_AUTO: "V3_VERIFIER_OPEN_ESCALATION_BLOCKS_AUTO",
  AUDIENCE_INTERNAL_ONLY_BLOCKS_AUTO: "V3_VERIFIER_AUDIENCE_INTERNAL_ONLY_BLOCKS_AUTO",
  AUDIENCE_VENDOR_ONLY_BLOCKS_AUTO: "V3_VERIFIER_AUDIENCE_VENDOR_ONLY_BLOCKS_AUTO",
  COMMERCIAL_CLIENT_VISIBLE_MEMORY_REVIEW: "V3_VERIFIER_COMMERCIAL_CLIENT_VISIBLE_MEMORY_REVIEW",
  PLAYBOOK_ASK_FIRST: "V3_VERIFIER_PLAYBOOK_ASK_FIRST",
  PLAYBOOK_DRAFT_ONLY: "V3_VERIFIER_PLAYBOOK_DRAFT_ONLY",
  PLAYBOOK_FORBIDDEN: "V3_VERIFIER_PLAYBOOK_FORBIDDEN",
  CASE_MEMORY_VERIFY_NOTE_DRAFT: "V3_VERIFIER_CASE_MEMORY_VERIFY_NOTE_DRAFT",
} as const;

export type VerifierReasonCode = (typeof VERIFIER_REASON_CODES)[keyof typeof VERIFIER_REASON_CODES];

/**
 * Coarse stage for orchestrator / QA. Maps from `facts.policyVerdict` + success.
 * - **draft_only** — pipeline may create a **draft**; must not auto-execute external send/commit.
 * - **escalate** — human / operator approval path (`ask` outcome).
 * - **block** — hard stop for autonomous execution.
 */
export type VerifierStageVerdict = "allow_auto" | "draft_only" | "escalate" | "block";

/** Internal policy verdict strings stored in `AgentResult.facts.policyVerdict` (tool contract). */
export type VerifierPolicyVerdict =
  | "allow_auto"
  | "require_draft_only"
  | "require_ask"
  | "require_operator_review"
  | "hard_block";

/**
 * When true, the pipeline must **not** perform autonomous external send or irreversible commit;
 * draft generation may still be allowed when `verifierStage` is `draft_only`.
 */
export function pipelineHaltsBeforeExternalSend(stage: VerifierStageVerdict): boolean {
  return stage !== "allow_auto";
}

/**
 * Derives stable orchestrator-facing stage from tool facts (pre-generation verifier output).
 */
export function deriveVerifierStageVerdict(
  verifierSuccess: boolean,
  policyVerdict: unknown,
): VerifierStageVerdict {
  if (typeof policyVerdict !== "string") {
    return verifierSuccess ? "allow_auto" : "block";
  }
  if (!verifierSuccess && policyVerdict === "hard_block") {
    return "block";
  }
  if (verifierSuccess && policyVerdict === "require_draft_only") {
    return "draft_only";
  }
  if (
    verifierSuccess &&
    (policyVerdict === "require_ask" || policyVerdict === "require_operator_review")
  ) {
    return "escalate";
  }
  if (verifierSuccess && policyVerdict === "allow_auto") {
    return "allow_auto";
  }
  if (!verifierSuccess) {
    return "block";
  }
  return "allow_auto";
}
