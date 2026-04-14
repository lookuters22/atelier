import type { AgentContext } from "../../../../src/types/agent.types.ts";
import type {
  DecisionAudienceSnapshot,
  DecisionContext,
  OrchestratorContextInjection,
} from "../../../../src/types/decisionContext.types.ts";

const PLACEHOLDER =
  "[Redacted: planner-private commercial context — not for this audience]";

/**
 * Patterns for planner-only commercial facts (memory/thread text). Conservative: multi-word phrases first.
 */
const SENSITIVE_LINE_PATTERNS: RegExp[] = [
  /\bplanner\s+commission\b/gi,
  /\bagency\s+fee\b/gi,
  /\bagency\s+fees\b/gi,
  /\binternal\s+markup\b/gi,
  /\bmarkup\s+margin\b/gi,
  /\binternal\s+negotiation\b/gi,
  /\binternal\s+deal\s+structure\b/gi,
  /\bprivate\s+margin\b/gi,
  /\bcommission\s+rate\b/gi,
  /\bcommission\s+of\s+\d/gi,
  /\b\d+\s*%?\s*commission\b/gi,
];

/**
 * Single-string redact for planner-private commercial phrases (V3 RBAC).
 * Use at any assembly boundary where client-visible audiences must not see commission / agency fee / internal markup wording.
 */
export function redactPlannerPrivateCommercialText(text: string): string {
  return redactTextBlock(text);
}

/**
 * Line-by-line redaction for large assembled prompts (e.g. persona writer facts). The single-block
 * {@link redactPlannerPrivateCommercialText} fallback can replace an entire multi-kilobyte string when
 * "commission" and "planner" appear in different sections — unsafe for client-visible persona input.
 */
export function redactPlannerPrivateCommercialMultilineText(text: string): string {
  if (!text) return text;
  return text.split(/\r?\n/).map((line) => redactTextBlock(line)).join("\n");
}

/**
 * Persona writer boundary: strip planner-private phrasing from the orchestrator-assembled facts block
 * for client-visible audiences only (planner-only runs pass facts through unchanged).
 */
export function redactPersonaWriterFactsBlockForAudience(
  facts: string,
  audience: Pick<DecisionAudienceSnapshot, "clientVisibleForPrivateCommercialRedaction">,
): string {
  if (!audience.clientVisibleForPrivateCommercialRedaction) {
    return facts;
  }
  return redactPlannerPrivateCommercialMultilineText(facts);
}

/** Aligned with `PersonaWriterCommittedTerms` / `CommercialCommittedTerms` (persona JSON audit). */
export type PersonaCommittedTermsRedactionSurface = {
  package_names: string[];
  deposit_percentage: number | null;
  travel_miles_included: number | null;
};

/**
 * Strip planner-private phrasing from structured `committed_terms.package_names` before
 * `instruction_history` persistence or other client-visible logs. Run commercial / prose auditors on the
 * model output first; apply this only for stored metadata.
 */
export function redactPersonaCommittedTermsForAudience(
  terms: PersonaCommittedTermsRedactionSurface,
  audience: Pick<DecisionAudienceSnapshot, "clientVisibleForPrivateCommercialRedaction">,
): PersonaCommittedTermsRedactionSurface {
  if (!audience.clientVisibleForPrivateCommercialRedaction) {
    return terms;
  }
  return {
    ...terms,
    package_names: terms.package_names.map((p) => redactPlannerPrivateCommercialText(p)),
  };
}

function redactTextBlock(text: string): string {
  let out = text;
  for (const re of SENSITIVE_LINE_PATTERNS) {
    out = out.replace(re, PLACEHOLDER);
  }
  if (out !== text) {
    return out;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes("commission") &&
    (lower.includes("planner") || lower.includes("agency") || lower.includes("internal"))
  ) {
    return PLACEHOLDER;
  }
  if (lower.includes("agency fee") || lower.includes("agency fees")) {
    return PLACEHOLDER;
  }
  return text;
}

function redactOptionalString(s: string | null | undefined): string | null {
  if (s == null || s === "") return s ?? null;
  const r = redactTextBlock(s);
  return r === s ? s : r;
}

/**
 * When `clientVisibleForPrivateCommercialRedaction` is true, strip planner-private commercial phrases
 * from memory, summaries, and thread text before orchestrator / persona.
 */
export function applyAudiencePrivateCommercialRedaction(dc: DecisionContext): DecisionContext {
  if (!dc.audience.clientVisibleForPrivateCommercialRedaction) {
    return dc;
  }

  const memoryHeaders = (dc.memoryHeaders ?? []).map((h) => ({
    ...h,
    title: redactTextBlock(h.title),
    summary: redactTextBlock(h.summary),
  }));

  const selectedMemories = (dc.selectedMemories ?? []).map((m) => ({
    ...m,
    title: redactTextBlock(m.title),
    summary: redactTextBlock(m.summary),
    full_content: redactTextBlock(m.full_content),
  }));

  const threadSummary = redactOptionalString(dc.threadSummary);

  const globalKnowledge = (dc.globalKnowledge ?? []).map((g) => {
    const next = { ...g };
    for (const key of ["body", "content", "text", "summary", "title"] as const) {
      const v = next[key];
      if (typeof v === "string") {
        (next as Record<string, unknown>)[key] = redactTextBlock(v);
      }
    }
    return next;
  });

  const recentMessages = (dc.recentMessages ?? []).map((m) => {
    const body = m.body;
    if (typeof body !== "string") return { ...m };
    return { ...m, body: redactTextBlock(body) };
  });

  return {
    ...dc,
    memoryHeaders,
    selectedMemories,
    threadSummary,
    globalKnowledge,
    recentMessages: recentMessages as AgentContext["recentMessages"],
  };
}

/**
 * Defense-in-depth at orchestrator injection assembly: re-applies the same redaction patterns to
 * bounded digest lines and rationale-facing strings so planner-private wording cannot slip through
 * if an upstream path forgets to redact before `buildOrchestratorSupportingContextInjection`.
 */
export function redactOrchestratorContextInjectionForAudience(
  injection: OrchestratorContextInjection,
  audience: Pick<DecisionAudienceSnapshot, "clientVisibleForPrivateCommercialRedaction">,
): OrchestratorContextInjection {
  if (!audience.clientVisibleForPrivateCommercialRedaction) {
    return injection;
  }
  return {
    ...injection,
    approved_supporting_facts: injection.approved_supporting_facts.map(redactPlannerPrivateCommercialText),
    action_constraints: injection.action_constraints.map(redactPlannerPrivateCommercialText),
    memory_digest_lines: injection.memory_digest_lines.map(redactPlannerPrivateCommercialText),
    global_knowledge_digest_lines: injection.global_knowledge_digest_lines.map(
      redactPlannerPrivateCommercialText,
    ),
    retrieval_observation: {
      ...injection.retrieval_observation,
      trace_line: redactPlannerPrivateCommercialText(injection.retrieval_observation.trace_line),
      global_knowledge_gate_detail: redactPlannerPrivateCommercialText(
        injection.retrieval_observation.global_knowledge_gate_detail,
      ),
    },
  };
}
