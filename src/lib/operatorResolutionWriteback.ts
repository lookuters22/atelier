import type {
  DecisionMode,
  OperatorResolutionWritebackArtifact,
  OperatorResolutionWritebackEnvelope,
  PlaybookRuleCandidateReviewStatus,
  RuleScope,
  ThreadChannel,
} from "../types/operatorResolutionWriteback.types.ts";
import {
  OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION,
  PLAYBOOK_RULE_CANDIDATE_REVIEW_STATUSES,
} from "../types/operatorResolutionWriteback.types.ts";
import { Constants } from "../types/database.types.ts";

/** Hard cap for persisted operator freeform text (matches DB safety; trim in writer). */
export const MAX_OPERATOR_RESOLUTION_TEXT_CHARS = 8000;
export const MAX_OPERATOR_RESOLUTION_SUMMARY_CHARS = 2000;

/** Repo-aligned enum vocabularies (must match `Database["public"]["Enums"]`). */
const DECISION_MODE_VALUES = Constants.public.Enums.decision_mode as readonly string[];
const RULE_SCOPE_VALUES = Constants.public.Enums.rule_scope as readonly string[];
const THREAD_CHANNEL_VALUES = Constants.public.Enums.thread_channel as readonly string[];

export function isPlaybookRuleCandidateReviewStatus(
  s: string,
): s is PlaybookRuleCandidateReviewStatus {
  return (PLAYBOOK_RULE_CANDIDATE_REVIEW_STATUSES as readonly string[]).includes(s);
}

export function truncateBoundedOperatorText(s: string, max: number = MAX_OPERATOR_RESOLUTION_TEXT_CHARS): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parseDecisionMode(v: unknown): DecisionMode | null {
  if (typeof v !== "string") return null;
  return DECISION_MODE_VALUES.includes(v) ? (v as DecisionMode) : null;
}

export function parseRuleScope(v: unknown): RuleScope | null {
  if (typeof v !== "string") return null;
  return RULE_SCOPE_VALUES.includes(v) ? (v as RuleScope) : null;
}

export function parseThreadChannel(v: unknown): ThreadChannel | null {
  if (typeof v !== "string") return null;
  return THREAD_CHANNEL_VALUES.includes(v) ? (v as ThreadChannel) : null;
}

/**
 * Optional 0–1 inclusive; `null`/`undefined` omit the field. Invalid values return `invalid`.
 */
export function parseOptionalConfidence(
  v: unknown,
): { ok: true; value: number | undefined } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false };
  if (v < 0 || v > 1) return { ok: false };
  return { ok: true, value: v };
}

/**
 * Optional integer >= 1; `undefined` omits. Invalid values return `invalid`.
 */
export function parseOptionalObservationCount(
  v: unknown,
): { ok: true; value: number | undefined } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) return { ok: false };
  if (v < 1) return { ok: false };
  return { ok: true, value: v };
}

/** Minimal structural validation for classifier output before RPC (stricten over time). */
export function parseOperatorResolutionWritebackEnvelope(
  input: unknown,
): OperatorResolutionWritebackEnvelope | null {
  if (!isRecord(input)) return null;
  if (input.schemaVersion !== OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION) return null;
  if (typeof input.photographerId !== "string" || input.photographerId.trim().length === 0) return null;
  if (!isRecord(input.correlation)) return null;
  if (!Array.isArray(input.artifacts)) return null;
  const artifacts: OperatorResolutionWritebackArtifact[] = [];
  for (const a of input.artifacts) {
    const p = parseOperatorResolutionWritebackArtifact(a);
    if (!p) return null;
    artifacts.push(p);
  }
  return {
    schemaVersion: OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION,
    photographerId: input.photographerId.trim(),
    correlation: {
      escalationId:
        typeof input.correlation.escalationId === "string" ? input.correlation.escalationId : undefined,
      threadId: typeof input.correlation.threadId === "string" ? input.correlation.threadId : undefined,
      weddingId: typeof input.correlation.weddingId === "string" ? input.correlation.weddingId : undefined,
      operatorResolutionSummary:
        typeof input.correlation.operatorResolutionSummary === "string"
          ? input.correlation.operatorResolutionSummary
          : undefined,
      rawOperatorText:
        typeof input.correlation.rawOperatorText === "string" ? input.correlation.rawOperatorText : undefined,
    },
    artifacts,
  };
}

export function parseOperatorResolutionWritebackArtifact(
  input: unknown,
): OperatorResolutionWritebackArtifact | null {
  if (!isRecord(input)) return null;
  const kind = input.kind;
  if (kind === "authorized_case_exception") {
    if (typeof input.overridesActionKey !== "string" || input.overridesActionKey.trim().length === 0) {
      return null;
    }
    if (!isRecord(input.overridePayload)) return null;
    return {
      kind: "authorized_case_exception",
      overridesActionKey: input.overridesActionKey.trim(),
      targetPlaybookRuleId:
        typeof input.targetPlaybookRuleId === "string" ? input.targetPlaybookRuleId : undefined,
      overridePayload: input.overridePayload as Record<string, unknown>,
      effectiveFromIso: typeof input.effectiveFromIso === "string" ? input.effectiveFromIso : undefined,
      effectiveUntilIso: typeof input.effectiveUntilIso === "string" ? input.effectiveUntilIso : undefined,
      notes: typeof input.notes === "string" ? input.notes : undefined,
    };
  }
  if (kind === "memory") {
    if (typeof input.memoryType !== "string" || input.memoryType.trim().length === 0) return null;
    if (typeof input.title !== "string" || typeof input.summary !== "string") return null;
    if (typeof input.fullContent !== "string") return null;
    return {
      kind: "memory",
      memoryType: input.memoryType.trim(),
      title: input.title,
      summary: input.summary,
      fullContent: input.fullContent,
      weddingId: typeof input.weddingId === "string" ? input.weddingId : undefined,
    };
  }
  if (kind === "playbook_rule_candidate") {
    if (typeof input.proposedActionKey !== "string" || input.proposedActionKey.trim().length === 0) return null;
    if (typeof input.topic !== "string" || input.topic.trim().length === 0) return null;
    if (typeof input.proposedInstruction !== "string" || input.proposedInstruction.trim().length === 0) {
      return null;
    }
    const proposedDecisionMode = parseDecisionMode(input.proposedDecisionMode);
    const proposedScope = parseRuleScope(input.proposedScope);
    if (proposedDecisionMode === null || proposedScope === null) return null;

    let proposedChannel: ThreadChannel | undefined;
    if (input.proposedChannel !== undefined && input.proposedChannel !== null) {
      const ch = parseThreadChannel(input.proposedChannel);
      if (ch === null) return null;
      proposedChannel = ch;
    }

    const conf = parseOptionalConfidence(input.confidence);
    if (!conf.ok) return null;

    const obs = parseOptionalObservationCount(input.observationCount);
    if (!obs.ok) return null;

    return {
      kind: "playbook_rule_candidate",
      proposedActionKey: input.proposedActionKey.trim(),
      topic: input.topic.trim(),
      proposedInstruction: input.proposedInstruction,
      proposedDecisionMode,
      proposedScope,
      proposedChannel,
      sourceClassification: isRecord(input.sourceClassification)
        ? (input.sourceClassification as Record<string, unknown>)
        : undefined,
      confidence: conf.value,
      operatorResolutionSummary:
        typeof input.operatorResolutionSummary === "string" ? input.operatorResolutionSummary : undefined,
      originatingOperatorText:
        typeof input.originatingOperatorText === "string" ? input.originatingOperatorText : undefined,
      sourceEscalationId: typeof input.sourceEscalationId === "string" ? input.sourceEscalationId : undefined,
      threadId: typeof input.threadId === "string" ? input.threadId : undefined,
      weddingId: typeof input.weddingId === "string" ? input.weddingId : undefined,
      observationCount: obs.value,
    };
  }
  return null;
}
