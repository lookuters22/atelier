import type { Database } from "./database.types.ts";

/**
 * Classifier / atomic-writeback contract for operator freeform resolutions (learning loop).
 * Versioned so later pipelines can migrate without guessing shapes.
 */
export const OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION = 1 as const;

export type DecisionMode = Database["public"]["Enums"]["decision_mode"];
export type RuleScope = Database["public"]["Enums"]["rule_scope"];
export type ThreadChannel = Database["public"]["Enums"]["thread_channel"];

/** DB `playbook_rule_candidates.review_status` — mirrored for app validation (no auto-promotion). */
export const PLAYBOOK_RULE_CANDIDATE_REVIEW_STATUSES = [
  "candidate",
  "approved",
  "rejected",
  "superseded",
] as const;

export type PlaybookRuleCandidateReviewStatus = (typeof PLAYBOOK_RULE_CANDIDATE_REVIEW_STATUSES)[number];

/** Shared traceability for all artifacts in one resolution turn. */
export type OperatorResolutionCorrelation = {
  escalationId?: string | null;
  threadId?: string | null;
  weddingId?: string | null;
  /** Bounded digest of what the operator decided (freeform or summarized). */
  operatorResolutionSummary?: string | null;
  /** Optional bounded capture of raw operator text (store only when policy allows). */
  rawOperatorText?: string | null;
};

export type OperatorResolutionWritebackEnvelope = {
  schemaVersion: typeof OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION;
  photographerId: string;
  correlation: OperatorResolutionCorrelation;
  /** One resolution may emit multiple structured artifacts (exception + memory + staged candidate). */
  artifacts: OperatorResolutionWritebackArtifact[];
};

/** Maps to `authorized_case_exceptions` insert / RPC payloads (existing merge semantics). */
export type AuthorizedCaseExceptionWriteback = {
  kind: "authorized_case_exception";
  overridesActionKey: string;
  targetPlaybookRuleId?: string | null;
  overridePayload: Record<string, unknown>;
  effectiveFromIso?: string | null;
  effectiveUntilIso?: string | null;
  notes?: string | null;
};

/** Maps to `memories` insert (interpersonal / contextual guidance — not policy override). */
export type MemoryWriteback = {
  kind: "memory";
  /** `memories.type` is freeform TEXT in DB; parser enforces non-empty string only (no closed vocabulary yet). */
  memoryType: string;
  title: string;
  summary: string;
  fullContent: string;
  weddingId?: string | null;
};

/**
 * Maps to `playbook_rule_candidates` insert — staged policy pattern only.
 * Does **not** create `playbook_rules`; promotion is a separate human-approved step.
 */
export type PlaybookRuleCandidateWriteback = {
  kind: "playbook_rule_candidate";
  proposedActionKey: string;
  topic: string;
  proposedInstruction: string;
  proposedDecisionMode: DecisionMode;
  proposedScope: RuleScope;
  proposedChannel?: ThreadChannel | null;
  sourceClassification?: Record<string, unknown>;
  confidence?: number | null;
  operatorResolutionSummary?: string | null;
  originatingOperatorText?: string | null;
  sourceEscalationId?: string | null;
  threadId?: string | null;
  weddingId?: string | null;
  observationCount?: number;
};

export type OperatorResolutionWritebackArtifact =
  | AuthorizedCaseExceptionWriteback
  | MemoryWriteback
  | PlaybookRuleCandidateWriteback;

/** Receipt from `complete_learning_loop_operator_resolution` (mapped in TS). */
export type LearningLoopResolutionReceipt = {
  status: "completed" | "already_completed";
  created_exception_ids: string[];
  created_memory_ids: string[];
  created_candidate_ids: string[];
  closed_escalation_id: string | null;
  correlation: OperatorResolutionCorrelation;
};
