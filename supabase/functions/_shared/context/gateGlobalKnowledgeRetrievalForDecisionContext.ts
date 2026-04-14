/**
 * Lightweight deterministic gate: skip `knowledge_base` SELECT when the turn is unlikely to benefit.
 *
 * **No DB calls** — same-process heuristics only (no embeddings, no scoring engine).
 *
 * **Truth hierarchy:** gating does not affect `playbook_rules` or case-memory promotion; it only avoids
 * an unnecessary tenant-scoped bulk read when signals are absent.
 */
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import type { DecisionContextRetrievalTrace } from "../../../../src/types/decisionContext.types.ts";

const MIN_TOKEN_LEN = 3;

/** Substantive turn: enough tokens that KB keyword overlap is plausible post-fetch. */
const SUBSTANTIVE_MIN_TOKENS = 6;

/** WhatsApp: shorter operational messages may still need brand/voice SOP context. */
const WHATSAPP_MIN_TOKENS = 2;

export type GlobalKnowledgeGateDecision = {
  /** When true, `buildDecisionContext` runs the bounded `knowledge_base` query. */
  queryKnowledgeBase: boolean;
  /** Deterministic code for `DecisionContextRetrievalTrace.globalKnowledgeGateDetail`. */
  gateDetail: string;
};

export type DecideGlobalKnowledgeGateInput = {
  rawMessage: string;
  threadSummary: string | null;
  replyChannel: AgentContext["replyChannel"];
  /** Ids chosen for case-memory hydration (explicit or deterministic promotion). */
  promotedMemoryIds: readonly string[];
  /** QA/replay: force the knowledge_base query regardless of heuristics. */
  qaBypassGate?: boolean;
};

const ACK_ONLY_PATTERN =
  /^(thanks|thank\s+you|ok|okay|k|yes|no|yep|nope|hi|hey|hello|sounds?\s+good|got\s+it|sure|cool)\.?$/i;

/** Lexicon cues for policy / commercial / delivery / voice guidance (word-boundary match on turn blob). */
const GATE_TRIGGER_TERMS: readonly string[] = [
  "retainer",
  "deposit",
  "balance",
  "invoice",
  "payment",
  "refund",
  "cancel",
  "cancellation",
  "contract",
  "agreement",
  "terms",
  "policy",
  "timeline",
  "deadline",
  "vendor",
  "planner",
  "package",
  "quote",
  "pricing",
  "fee",
  "booking",
  "schedule",
  "availability",
  "wedding",
  "deliverable",
  "gallery",
  "album",
  "copyright",
  "license",
  "hours",
  "coverage",
  "overtime",
  "travel",
  "discount",
  "brand",
  "voice",
  "legal",
];

function tokenize(text: string): string[] {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/g);
  return raw.filter((t) => t.length >= MIN_TOKEN_LEN);
}

function turnBlob(input: DecideGlobalKnowledgeGateInput): string {
  return `${input.rawMessage}\n${input.threadSummary ?? ""}`;
}

function hasTriggerTerm(lcBlob: string): boolean {
  for (const term of GATE_TRIGGER_TERMS) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lcBlob)) return true;
  }
  return false;
}

/**
 * Decides whether to run the bounded `knowledge_base` bulk select for this turn.
 */
export function decideGlobalKnowledgeBaseQuery(
  input: DecideGlobalKnowledgeGateInput,
): GlobalKnowledgeGateDecision {
  if (input.qaBypassGate === true) {
    return { queryKnowledgeBase: true, gateDetail: "qa_bypass" };
  }

  const blob = turnBlob(input);
  const trimmed = blob.trim();
  if (trimmed.length === 0) {
    return { queryKnowledgeBase: false, gateDetail: "skipped_empty_turn" };
  }

  /** Case-memory promotion implies the turn is case-active; allow KB even when the inbound has no ≥3-char tokens (e.g. “ok”). */
  if (input.promotedMemoryIds.length > 0) {
    return { queryKnowledgeBase: true, gateDetail: "query_memory_promotion" };
  }

  const tokens = tokenize(blob);
  if (tokens.length === 0) {
    return { queryKnowledgeBase: false, gateDetail: "skipped_no_tokens" };
  }

  const singleLine = trimmed.replace(/\s+/g, " ");
  const ackNormalized = singleLine.replace(/[!?.]+$/g, "").trim();
  if (ACK_ONLY_PATTERN.test(ackNormalized)) {
    return { queryKnowledgeBase: false, gateDetail: "skipped_ack_only" };
  }

  const lc = blob.toLowerCase();
  if (hasTriggerTerm(lc)) {
    return { queryKnowledgeBase: true, gateDetail: "query_trigger_lexicon" };
  }

  if (input.replyChannel === "whatsapp" && tokens.length >= WHATSAPP_MIN_TOKENS) {
    return { queryKnowledgeBase: true, gateDetail: "query_whatsapp_channel" };
  }

  if (tokens.length >= SUBSTANTIVE_MIN_TOKENS) {
    return { queryKnowledgeBase: true, gateDetail: "query_substantive_turn" };
  }

  return { queryKnowledgeBase: false, gateDetail: "skipped_no_heuristic_signal" };
}

/**
 * First-class retrieval audit fields for orchestrator / QA (not passed to persona).
 */
export function buildDecisionContextRetrievalTrace(parts: {
  selectedMemoryIdsResolved: readonly string[];
  selectedMemories: AgentContext["selectedMemories"];
  globalKnowledge: AgentContext["globalKnowledge"];
  gate: GlobalKnowledgeGateDecision;
}): DecisionContextRetrievalTrace {
  const gkIds = parts.globalKnowledge
    .map((g) => {
      const id = (g as Record<string, unknown>)["id"];
      return typeof id === "string" && id.length > 0 ? id : null;
    })
    .filter((x): x is string => x !== null);

  return {
    selectedMemoryIdsResolved: [...parts.selectedMemoryIdsResolved],
    selectedMemoriesLoadedCount: parts.selectedMemories.length,
    globalKnowledgeIdsLoaded: gkIds,
    globalKnowledgeLoadedCount: gkIds.length,
    globalKnowledgeFetch: parts.gate.queryKnowledgeBase ? "queried" : "skipped_by_gate",
    globalKnowledgeGateDetail: parts.gate.gateDetail,
  };
}
