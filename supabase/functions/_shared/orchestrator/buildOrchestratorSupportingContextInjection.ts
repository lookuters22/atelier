/**
 * V3 — bounded orchestrator context injection from `DecisionContext` layers.
 * Orchestrator may use this to reason; persona receives only synthesized lines via proposal rationale
 * (`buildOrchestratorFactsForPersonaWriter`), not raw `full_content` / KB blobs.
 *
 * Truth hierarchy: `playbook_rules` remain primary structured policy; `selectedMemories` and
 * `globalKnowledge` are supporting only and do not silently override playbook in this slice.
 */
import type {
  DecisionAudienceSnapshot,
  DecisionContextRetrievalTrace,
  InboundSenderAuthoritySnapshot,
  OrchestratorContextInjection,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import type { CrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import { redactOrchestratorContextInjectionForAudience } from "../context/applyAudiencePrivateCommercialRedaction.ts";
import { crmHasPackageInclusion } from "../context/crmPackageInclusions.ts";
import { detectPackageInclusionQuestionIntent } from "./detectPackageInclusionQuestionIntent.ts";
import {
  ACTION_CONSTRAINT_COMMERCIAL_FINANCIAL_STARVATION,
  commercialDepositStarvationStructuredApplies,
} from "./orchestratorCommercialDepositStarvation.ts";
import { detectMultiActorAuthorityRefinement } from "./detectMultiActorAuthorityRefinement.ts";
import { billingPayerMismatchActionConstraints } from "../context/billingPayerWorkflowContext.ts";

/** Stable substrings for tests / QA — package-inclusion slice (travel + second shooter). */
export const PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM =
  "CRM package_inclusions includes travel_fee_included";
export const PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_NOT_LISTED =
  "CRM package_inclusions does not list travel_fee_included";
export const PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_CONFIRM =
  "CRM package_inclusions includes second_shooter";
export const PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_NOT_LISTED =
  "CRM package_inclusions does not list second_shooter";

export const MAX_MEMORY_DIGEST_LINE_CHARS = 180;
export const MAX_KB_DIGEST_LINE_CHARS = 200;
export const MAX_ORCHESTRATOR_APPROVED_FACTS = 8;
/** Total appended rationale suffix (orchestrator-facing; still bounded for logs/persona rationale). */
export const MAX_ORCHESTRATOR_CONTEXT_RATIONALE_SUFFIX_CHARS = 1200;

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function kbRowDigest(row: Record<string, unknown>, index: number): string {
  const idRaw = row.id;
  const id =
    typeof idRaw === "string"
      ? idRaw.slice(0, 8)
      : typeof idRaw === "number"
        ? String(idRaw)
        : `i${index}`;
  const dt = typeof row.document_type === "string" ? row.document_type : "doc";
  const content = typeof row.content === "string" ? row.content : "";
  const excerpt = truncate(content, 90);
  return `${id}… [${dt}] ${excerpt}`;
}

export type BuildOrchestratorSupportingContextInjectionInput = {
  selectedMemories: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    /** Used only for multi-actor authority verify-note scan — not shown raw to persona. */
    full_content?: string;
  }>;
  globalKnowledge: Array<Record<string, unknown>>;
  retrievalTrace: DecisionContextRetrievalTrace;
  /** Effective scoped playbook rows (same source as verifier/persona excerpts). */
  playbookRules: PlaybookRuleContextRow[];
  audience: DecisionAudienceSnapshot;
  /** Inquiry-stage plan when applicable; null otherwise (same derivation as persona path). */
  inquiryReplyPlan: InquiryReplyPlan | null;
  /** When set with {@link rawMessageForPackageInclusion}, enables travel/second-shooter inclusion Q&A grounding. */
  crmSnapshot?: CrmSnapshot | null;
  /** Inbound for this turn — used only for deterministic package-inclusion intent (not replay of thread). */
  rawMessageForPackageInclusion?: string;
  /** Multi-actor authority slice — when set with {@link rawMessageForMultiActorAuthority}, adds grounded constraints. */
  inboundSenderAuthority?: InboundSenderAuthoritySnapshot | null;
  rawMessageForMultiActorAuthority?: string;
};

function packageInclusionCrmSlice(
  rawMessage: string | undefined,
  crmSnapshot: CrmSnapshot | null | undefined,
): { facts: string[]; constraints: string[] } {
  const facts: string[] = [];
  const constraints: string[] = [];
  if (!rawMessage?.trim() || crmSnapshot === undefined || crmSnapshot === null) {
    return { facts, constraints };
  }
  const intent = detectPackageInclusionQuestionIntent(rawMessage);
  if (!intent) return { facts, constraints };

  if (intent === "travel_inclusion") {
    if (crmHasPackageInclusion(crmSnapshot, "travel_fee_included")) {
      facts.push(
        `${PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM} — the client asked about travel for this turn; confirm in the reply that travel is covered per the booked package. Do not invent separate line-item pricing.`,
      );
    } else {
      constraints.push(
        `${PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_NOT_LISTED} — do not confirm complimentary travel or flights; explain it is not listed as included in CRM and offer a quote, clarification, or next step (quote-safe).`,
      );
    }
  } else {
    if (crmHasPackageInclusion(crmSnapshot, "second_shooter")) {
      facts.push(
        `${PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_CONFIRM} — the client asked about a second shooter for this turn; confirm in the reply that a second shooter is included per package. Do not invent add-on pricing.`,
      );
    } else {
      constraints.push(
        `${PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_NOT_LISTED} — do not confirm a second shooter is bundled; explain it is not listed as included in CRM and offer add-on options, a quote, or clarification.`,
      );
    }
  }
  return { facts, constraints };
}

export function buildOrchestratorSupportingContextInjection(
  input: BuildOrchestratorSupportingContextInjectionInput,
): OrchestratorContextInjection {
  const {
    selectedMemories,
    globalKnowledge,
    retrievalTrace,
    playbookRules,
    audience,
    inquiryReplyPlan,
    crmSnapshot,
    rawMessageForPackageInclusion,
    inboundSenderAuthority,
    rawMessageForMultiActorAuthority,
  } = input;
  const playbookRuleCount = playbookRules.length;

  const approved_supporting_facts: string[] = [];
  const action_constraints: string[] = [];

  approved_supporting_facts.push(
    `Playbook rules (${playbookRuleCount} rows) are primary structured policy; case memory and studio KB are supporting context only and must not override playbook.`,
  );

  if (selectedMemories.length > 0) {
    const verifyNotes = selectedMemories.filter((m) => m.type === "v3_verify_case_note");
    if (verifyNotes.length > 0) {
      action_constraints.push(
        "Verify-note memory present — confirm commercial terms against playbook_rules or CRM before asserting numbers outbound.",
      );
    }
    approved_supporting_facts.push(
      `${selectedMemories.length} case memory row(s) loaded for grounding; titles/summaries are not authoritative vs playbook.`,
    );
  }

  if (globalKnowledge.length > 0) {
    approved_supporting_facts.push(
      `${globalKnowledge.length} studio knowledge_base row(s) loaded for tone/SOP alignment; not a substitute for contract or playbook terms.`,
    );
  }

  if (retrievalTrace.globalKnowledgeFetch === "skipped_by_gate") {
    approved_supporting_facts.push(
      `Global knowledge fetch skipped (${truncate(retrievalTrace.globalKnowledgeGateDetail, 120)}) — no KB rows attached this turn.`,
    );
  }

  action_constraints.push(
    "Do not treat memory or KB excerpts as authoritative pricing, legal terms, or policy; prefer playbook_rules and verified CRM.",
  );

  if (commercialDepositStarvationStructuredApplies(playbookRules, audience, inquiryReplyPlan)) {
    action_constraints.push(ACTION_CONSTRAINT_COMMERCIAL_FINANCIAL_STARVATION);
  }

  if (
    inboundSenderAuthority != null &&
    typeof rawMessageForMultiActorAuthority === "string" &&
    rawMessageForMultiActorAuthority.trim().length > 0
  ) {
    const mar = detectMultiActorAuthorityRefinement({
      rawMessage: rawMessageForMultiActorAuthority,
      authority: inboundSenderAuthority,
      selectedMemories: selectedMemories.map((m) => ({
        type: m.type,
        title: m.title,
        summary: m.summary,
        full_content: m.full_content,
      })),
      audience,
    });
    if (mar.hit) {
      for (const c of mar.injectionConstraints) {
        action_constraints.push(c);
      }
    }
  }

  const pkg = packageInclusionCrmSlice(rawMessageForPackageInclusion, crmSnapshot ?? null);
  const approvedWithPackage = [...pkg.facts, ...approved_supporting_facts];
  for (const c of pkg.constraints) {
    action_constraints.push(c);
  }

  if (audience.billingPayerWorkflow != null) {
    for (const c of billingPayerMismatchActionConstraints(audience.billingPayerWorkflow)) {
      action_constraints.push(c);
    }
  }

  const memory_digest_lines = selectedMemories.map((m) =>
    truncate(`${m.type}: ${m.title} — ${m.summary}`, MAX_MEMORY_DIGEST_LINE_CHARS),
  );

  const global_knowledge_digest_lines = globalKnowledge.map((row, i) =>
    truncate(kbRowDigest(row, i), MAX_KB_DIGEST_LINE_CHARS),
  );

  const trace_line = truncate(
    [
      `mem=${retrievalTrace.selectedMemoriesLoadedCount}/${retrievalTrace.selectedMemoryIdsResolved.length} ids`,
      `gk_fetch=${retrievalTrace.globalKnowledgeFetch}`,
      `gk_rows=${retrievalTrace.globalKnowledgeLoadedCount}`,
      retrievalTrace.globalKnowledgeGateDetail,
    ].join(" | "),
    420,
  );

  const injection: OrchestratorContextInjection = {
    approved_supporting_facts: approvedWithPackage.slice(0, MAX_ORCHESTRATOR_APPROVED_FACTS),
    action_constraints,
    retrieval_observation: {
      selected_memory_ids: [...retrievalTrace.selectedMemoryIdsResolved],
      global_knowledge_ids_loaded: [...retrievalTrace.globalKnowledgeIdsLoaded],
      global_knowledge_fetch: retrievalTrace.globalKnowledgeFetch,
      global_knowledge_gate_detail: retrievalTrace.globalKnowledgeGateDetail,
      trace_line,
    },
    memory_digest_lines,
    global_knowledge_digest_lines,
  };

  return redactOrchestratorContextInjectionForAudience(injection, audience);
}

/**
 * Compact suffix merged into primary proposal rationales (send_message + playbook rows).
 * **Persona path:** includes only synthesized facts, constraints, and one retrieval observability line —
 * not memory/KB digest lines (those stay on `OrchestratorContextInjection` for orchestrator/QA only).
 * Bounded — not a second prompt; avoids stuffing `retrievalTrace` verbatim.
 */
export function formatOrchestratorContextInjectionRationaleSuffix(
  injection: OrchestratorContextInjection,
): string {
  const bits: string[] = [];
  bits.push(injection.approved_supporting_facts.join(" "));
  if (injection.action_constraints.length > 0) {
    bits.push(`Constraints: ${injection.action_constraints.join(" ")}`);
  }
  bits.push(`Retrieval: ${injection.retrieval_observation.trace_line}`);
  const joined = bits.join(" ");
  if (joined.length <= MAX_ORCHESTRATOR_CONTEXT_RATIONALE_SUFFIX_CHARS) return joined;
  return joined.slice(0, MAX_ORCHESTRATOR_CONTEXT_RATIONALE_SUFFIX_CHARS - 1) + "…";
}
