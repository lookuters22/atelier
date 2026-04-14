/**
 * Deterministic policy evaluation for `toolVerifier` (execute_v3 Step 6D) using `DecisionContext`-shaped
 * inputs (no persona / writer access).
 *
 * **Pre-generation vs post-generation:** This module is part of the **Verifier** that runs **before**
 * draft/persona generation on **action + intent + context**. It is **not** the Output Auditor, which
 * evaluates **final text** after generation (e.g. leakage, compliance on prose).
 *
 * **Truth hierarchy:** baseline `playbook_rules` plus deterministic merge with **active**
 * `authorized_case_exceptions` (see `deriveEffectivePlaybook`) — verifier receives the **effective** rows.
 * `selectedMemories` / `globalKnowledge` are supporting context only and do not override policy.
 *
 * This slice gates **autonomous (`auto`) execution** only; `draft_only` / `ask_first` / `forbidden` modes
 * are passed through without coercion here.
 */
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import {
  VERIFIER_REASON_CODES,
  type VerifierReasonCode,
} from "../../../../src/types/verifier.types.ts";

/** Aligns with `ToolVerifierInputSchema` / `ClientOrchestratorV1ExecutionMode`. */
export type VerifierRequestedExecutionMode = "auto" | "draft_only" | "ask_first" | "forbidden";

export { VERIFIER_REASON_CODES, type VerifierReasonCode };

export type VerifierPolicyGateAudience = {
  visibilityClass: string;
  clientVisibleForPrivateCommercialRedaction: boolean;
  broadcastRisk: string;
  recipientCount: number;
};

export type VerifierPolicyGatePlaybookRow = {
  id: string;
  action_key: string;
  decision_mode: string | null;
  topic: string | null;
  is_active: boolean;
};

export type VerifierPolicyGateMemorySummary = {
  id: string;
  type: string;
};

export type VerifierPolicyGateRetrievalTrace = {
  globalKnowledgeFetch: "queried" | "skipped_by_gate";
  globalKnowledgeGateDetail?: string;
  selectedMemoryIdsResolved: string[];
};

/**
 * Narrow snapshot passed from `buildVerifierPayloadForClientOrchestratorV1` — mirrors `DecisionContext`
 * fields without raw memory / KB text.
 */
export type VerifierPolicyGateInput = {
  audience: VerifierPolicyGateAudience;
  playbookRules: VerifierPolicyGatePlaybookRow[];
  selectedMemoriesSummary: VerifierPolicyGateMemorySummary[];
  globalKnowledgeLoadedCount: number;
  retrievalTrace?: VerifierPolicyGateRetrievalTrace | null;
  escalationOpenCount: number;
  /**
   * When set, only `playbook_rules` rows with this exact `action_key` participate in decision_mode merge.
   * Omit to preserve legacy behavior (merge across all rows in `playbookRules`).
   */
  policyEvaluationActionKey?: string;
};

export type VerifierPolicyEvaluation =
  | { outcome: "pass"; supportingSignals?: Record<string, unknown> }
  | {
      outcome: "coerce";
      policyVerdict: "require_draft_only" | "require_ask" | "require_operator_review";
      reasonCodes: VerifierReasonCode[];
      supportingSignals?: Record<string, unknown>;
    }
  | {
      outcome: "hard_fail";
      reasonCodes: VerifierReasonCode[];
      errorMessage: string;
      supportingSignals?: Record<string, unknown>;
    };

type DecisionModeRank = 0 | 1 | 2 | 3 | 4;

function decisionModeRank(dm: string | null | undefined): DecisionModeRank {
  switch (dm) {
    case "auto":
      return 1;
    case "draft_only":
      return 2;
    case "ask_first":
      return 3;
    case "forbidden":
      return 4;
    default:
      return 0;
  }
}

/**
 * Strongest `decision_mode` wins across active playbook rows (deterministic tie-break by rank).
 */
export function mergePlaybookDecisionModes(
  rules: VerifierPolicyGatePlaybookRow[],
): "auto" | "draft_only" | "ask_first" | "forbidden" | null {
  let best: DecisionModeRank = 0;
  let picked: "auto" | "draft_only" | "ask_first" | "forbidden" | null = null;
  for (const r of rules) {
    if (r.is_active === false) continue;
    const dm = (r.decision_mode ?? "auto") as "auto" | "draft_only" | "ask_first" | "forbidden";
    const rk = decisionModeRank(dm);
    if (rk > best) {
      best = rk;
      picked = dm;
    }
  }
  if (best <= 1) return null;
  return picked;
}

/**
 * Deterministic: only rows whose `action_key` equals `evaluationActionKey` are merged.
 * When `evaluationActionKey` is omitted/empty, returns all rows (legacy merge-all).
 */
export function filterPlaybookRulesForVerifierPolicyMerge(
  rules: VerifierPolicyGatePlaybookRow[],
  evaluationActionKey: string | undefined,
): VerifierPolicyGatePlaybookRow[] {
  if (evaluationActionKey === undefined || evaluationActionKey === "") {
    return rules;
  }
  return rules.filter((r) => r.action_key === evaluationActionKey);
}

/**
 * Picks which playbook `action_key` the policy gate should merge for `auto` execution.
 * Prefers a playbook-backed `send_message` proposal with a non-`send_message` key (explicit tenant rule row);
 * otherwise uses `send_message` for the routine outbound candidate.
 */
export function resolveVerifierPolicyEvaluationActionKey(
  proposedActions: OrchestratorProposalCandidate[],
): string {
  const playbookSend = proposedActions.filter(
    (p) =>
      Array.isArray(p.playbook_rule_ids) &&
      p.playbook_rule_ids.length > 0 &&
      p.action_family === "send_message",
  );
  if (playbookSend.length > 0) {
    const specific = playbookSend.find((p) => p.action_key !== "send_message");
    if (specific) return specific.action_key;
    return "send_message";
  }
  const routine = proposedActions.find(
    (p) => p.action_family === "send_message" && p.action_key === "send_message",
  );
  if (routine) return "send_message";
  const anySend = proposedActions.find((p) => p.action_family === "send_message");
  return anySend?.action_key ?? "send_message";
}

const VERIFY_NOTE_TYPE = "v3_verify_case_note";

/**
 * Evaluates tenant policy gate for the verifier. Call only after the broadcast-risk pre-check passes.
 */
export function evaluateVerifierPolicyGate(
  policyGate: VerifierPolicyGateInput,
  requestedExecutionMode: VerifierRequestedExecutionMode,
): VerifierPolicyEvaluation {
  const policyEvalKey = policyGate.policyEvaluationActionKey;
  const relevantRules = filterPlaybookRulesForVerifierPolicyMerge(policyGate.playbookRules, policyEvalKey);
  const mergedPlaybookFromRelevant = mergePlaybookDecisionModes(relevantRules);
  const policyGateSignals: Record<string, unknown> = {
    policyEvaluationActionKey: policyEvalKey ?? null,
    policyRelevantPlaybookRuleIds: relevantRules.map((r) => r.id),
    policyRelevantPlaybookRuleActionKeys: [...new Set(relevantRules.map((r) => r.action_key))],
    mergedPlaybookDecisionModeFromRelevantRules: mergedPlaybookFromRelevant,
  };

  if (requestedExecutionMode !== "auto") {
    return {
      outcome: "pass",
      supportingSignals: {
        policyGateSkippedForMode: requestedExecutionMode,
        globalKnowledgeLoadedCount: policyGate.globalKnowledgeLoadedCount,
        retrievalTracePresent: policyGate.retrievalTrace !== undefined && policyGate.retrievalTrace !== null,
        ...policyGateSignals,
      },
    };
  }

  const supportingSignals: Record<string, unknown> = {
    selectedMemoriesCount: policyGate.selectedMemoriesSummary.length,
    globalKnowledgeLoadedCount: policyGate.globalKnowledgeLoadedCount,
    retrievalTracePresent: policyGate.retrievalTrace !== undefined && policyGate.retrievalTrace !== null,
    ...policyGateSignals,
  };

  if (policyGate.escalationOpenCount > 0) {
    return {
      outcome: "hard_fail",
      reasonCodes: [VERIFIER_REASON_CODES.OPEN_ESCALATION_BLOCKS_AUTO],
      errorMessage: "open_escalation_blocks_auto_execution",
      supportingSignals,
    };
  }

  if (policyGate.audience.visibilityClass === "internal_only") {
    return {
      outcome: "hard_fail",
      reasonCodes: [VERIFIER_REASON_CODES.AUDIENCE_INTERNAL_ONLY_BLOCKS_AUTO],
      errorMessage: "audience_internal_only_blocks_auto_execution",
      supportingSignals,
    };
  }

  if (policyGate.audience.visibilityClass === "vendor_only") {
    return {
      outcome: "hard_fail",
      reasonCodes: [VERIFIER_REASON_CODES.AUDIENCE_VENDOR_ONLY_BLOCKS_AUTO],
      errorMessage: "audience_vendor_only_blocks_auto_execution",
      supportingSignals,
    };
  }

  const mergedPlaybook = mergedPlaybookFromRelevant;
  if (mergedPlaybook === "forbidden") {
    return {
      outcome: "hard_fail",
      reasonCodes: [VERIFIER_REASON_CODES.PLAYBOOK_FORBIDDEN],
      errorMessage: "playbook_forbidden_blocks_auto_execution",
      supportingSignals,
    };
  }

  if (mergedPlaybook === "ask_first") {
    return {
      outcome: "coerce",
      policyVerdict: "require_ask",
      reasonCodes: [VERIFIER_REASON_CODES.PLAYBOOK_ASK_FIRST],
      supportingSignals,
    };
  }

  const hasVerifyCaseNote = policyGate.selectedMemoriesSummary.some(
    (m) => m.type === VERIFY_NOTE_TYPE,
  );

  const vis = policyGate.audience.visibilityClass;
  const needsCommercialClientVisibleMemoryReview =
    policyGate.audience.clientVisibleForPrivateCommercialRedaction === true &&
    (vis === "client_visible" || vis === "mixed_audience") &&
    policyGate.selectedMemoriesSummary.length > 0;

  if (mergedPlaybook === "draft_only" || hasVerifyCaseNote || needsCommercialClientVisibleMemoryReview) {
    const reasonCodes: VerifierReasonCode[] = [];
    if (mergedPlaybook === "draft_only") {
      reasonCodes.push(VERIFIER_REASON_CODES.PLAYBOOK_DRAFT_ONLY);
    }
    if (hasVerifyCaseNote) {
      reasonCodes.push(VERIFIER_REASON_CODES.CASE_MEMORY_VERIFY_NOTE_DRAFT);
    }
    if (needsCommercialClientVisibleMemoryReview) {
      reasonCodes.push(VERIFIER_REASON_CODES.COMMERCIAL_CLIENT_VISIBLE_MEMORY_REVIEW);
    }
    return {
      outcome: "coerce",
      policyVerdict: "require_draft_only",
      reasonCodes,
      supportingSignals,
    };
  }

  return { outcome: "pass", supportingSignals };
}
