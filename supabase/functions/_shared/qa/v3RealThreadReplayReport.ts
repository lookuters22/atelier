/**
 * V3 real-thread replay report — bounded observability for `executeClientOrchestratorV1Core` (QA only).
 * Does not expose raw memory bodies or unbounded KB text; surfaces ids, counts, traces, and compact policy diffs.
 */
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import type {
  DecisionContextRetrievalTrace,
  EffectivePlaybookRule,
  OrchestratorContextInjection,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import type {
  ClientOrchestratorV1CoreResult,
  OrchestratorHeavyContextLayers,
} from "../orchestrator/clientOrchestratorV1Core.ts";
import { mergePlaybookDecisionModes } from "../tools/verifierPolicyGate.ts";

function parseMergedPlaybookModeFromVerifierFacts(
  facts: Record<string, unknown> | undefined,
): "draft_only" | "ask_first" | "forbidden" | null | undefined {
  if (!facts || !("mergedPlaybookDecisionModeFromRelevantRules" in facts)) {
    return undefined;
  }
  const v = facts.mergedPlaybookDecisionModeFromRelevantRules;
  if (v === null) return null;
  if (v === "draft_only" || v === "ask_first" || v === "forbidden") return v;
  return undefined;
}

function parsePolicyRelevantRuleIds(facts: Record<string, unknown> | undefined): string[] {
  const raw = facts?.policyRelevantPlaybookRuleIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function parsePolicyEvaluationActionKey(facts: Record<string, unknown> | undefined): string | null {
  const k = facts?.policyEvaluationActionKey;
  return typeof k === "string" && k.length > 0 ? k : null;
}

/** Compact diff when an authorized exception narrows a baseline playbook row. */
export type AuthorizedExceptionPolicyDiffRow = {
  action_key: string;
  source_rule_id: string;
  exception_id: string;
  changed_fields: {
    decision_mode?: { from: string; to: string };
    /** No raw instruction text — classification only. */
    instruction?: "unchanged" | "appended" | "overridden";
  };
};

function instructionChangeKind(
  baseInstr: string | null | undefined,
  effInstr: string | null | undefined,
): "unchanged" | "appended" | "overridden" {
  const b = (baseInstr ?? "").trim();
  const e = (effInstr ?? "").trim();
  if (b === e) return "unchanged";
  if (b.length > 0 && e.startsWith(b) && e.length > b.length) return "appended";
  return "overridden";
}

/**
 * Rows where effective policy was merged from `authorized_case_exceptions` (not raw playbook alone).
 */
export function buildAuthorizedExceptionPolicyDiffs(
  rawRules: PlaybookRuleContextRow[],
  effectiveRules: EffectivePlaybookRule[],
): AuthorizedExceptionPolicyDiffRow[] {
  const rawById = new Map(rawRules.map((r) => [r.id, r]));
  const out: AuthorizedExceptionPolicyDiffRow[] = [];

  for (const eff of effectiveRules) {
    if (eff.effectiveDecisionSource !== "authorized_exception" || !eff.appliedAuthorizedExceptionId) {
      continue;
    }
    const base = rawById.get(eff.id);
    if (!base) continue;

    const changed: AuthorizedExceptionPolicyDiffRow["changed_fields"] = {};
    if (base.decision_mode !== eff.decision_mode) {
      changed.decision_mode = { from: base.decision_mode, to: eff.decision_mode };
    }
    const ik = instructionChangeKind(base.instruction, eff.instruction);
    if (ik !== "unchanged") {
      changed.instruction = ik;
    }

    if (Object.keys(changed).length === 0) {
      continue;
    }

    out.push({
      action_key: eff.action_key,
      source_rule_id: eff.id,
      exception_id: eff.appliedAuthorizedExceptionId,
      changed_fields: changed,
    });
  }

  return out;
}

export function extractVerifierReplaySurface(facts: Record<string, unknown> | undefined): {
  verifierStage: string | null;
  reasonCodes: string[];
  policyVerdict: string | null;
  pipelineHaltsBeforeExternalSend: boolean | null;
} {
  if (!facts || typeof facts !== "object") {
    return {
      verifierStage: null,
      reasonCodes: [],
      policyVerdict: null,
      pipelineHaltsBeforeExternalSend: null,
    };
  }
  const stage = typeof facts.verifierStage === "string" ? facts.verifierStage : null;
  const pv = typeof facts.policyVerdict === "string" ? facts.policyVerdict : null;
  const rc = Array.isArray(facts.reasonCodes)
    ? (facts.reasonCodes as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const halt =
    typeof facts.pipelineHaltsBeforeExternalSend === "boolean"
      ? facts.pipelineHaltsBeforeExternalSend
      : null;
  return {
    verifierStage: stage,
    reasonCodes: rc.length > 0 ? rc : [],
    policyVerdict: pv,
    pipelineHaltsBeforeExternalSend: halt,
  };
}

export type V3RealThreadReplaySnapshot = {
  schema: "v3_real_thread_replay_v1";
  scenarioId: string;
  scenarioTitle: string;
  expectedRealManagerNote: string;
  honestDivergenceFromRealManager: string;
  context: {
    selectedMemoriesCount: number;
    selectedMemoryIds: string[];
    globalKnowledgeCount: number;
    globalKnowledgeIdsLoaded: string[];
    retrievalTrace: DecisionContextRetrievalTrace | null;
    rawPlaybookRuleCount: number;
    authorizedCaseExceptionCount: number;
    effectivePlaybookRuleCount: number;
    authorizedExceptionPolicyDiffs: AuthorizedExceptionPolicyDiffRow[];
    anyRuleOverriddenByAuthorizedException: boolean;
  };
  verifier: {
    success: boolean;
    verifierStage: string | null;
    reasonCodes: string[];
    policyVerdict: string | null;
    pipelineHaltsBeforeExternalSend: boolean | null;
    error?: string;
    /** Action-key–scoped policy merge (when toolVerifier ran with orchestrator proposals). */
    policyEvaluationActionKey?: string | null;
    policyRelevantPlaybookRuleIds?: string[];
    mergedPlaybookDecisionModeFromRelevantRules?: "draft_only" | "ask_first" | "forbidden" | null;
  };
  orchestrator: {
    outcome: string;
    proposalCount: number;
    chosenActionKey: string | null;
    chosenLikelyOutcome: string | null;
  };
  persona: {
    pathAttempted: boolean;
    outputAuditorPassed: boolean | null;
    outputAuditorRan: boolean;
    skipOrViolationSummary: string | null;
  };
  orchestratorContextInjectionTraceLine: string | null;
  /** High-risk replay slice — expected vs actual, policy/exception tension, authority signals. */
  replay?: {
    expectedOutcomeSummary?: string;
    seedMetadata?: Record<string, unknown>;
    inboundSenderAuthority?: {
      bucket: string;
      isApprovalContact: boolean;
      source: string;
      personId: string | null;
    };
    /**
     * Strongest `decision_mode` for verifier evaluation — prefers action-key–scoped merge from verifier
     * facts; falls back to legacy merge-all when facts omit `mergedPlaybookDecisionModeFromRelevantRules`.
     */
    mergedPlaybookStrongestMode: "draft_only" | "ask_first" | "forbidden" | null;
    /** Proposal `action_key` values tied to authority policy (AP1) routing. */
    authorityPolicyProposalActionKeys: string[];
    /** Types of hydrated selected memories (no bodies). */
    hydratedSelectedMemoryTypes: string[];
    /** Short narrative when verify-note + playbook/verifier interact (policy-vs-memory slice). */
    policyVsMemoryTensionNote?: string;
    /** Orchestrator injection carried `COMMERCIAL_FINANCIAL_STARVATION` in `action_constraints` (payment terms not specifically grounded). */
    commercialStarvationConstraintInjected?: boolean;
    /** Orchestrator injection carried multi-actor authority grounded constraints (planner timeline / payer scope). */
    multiActorAuthorityConstraintInjected?: boolean;
    /** Bounded lines from `core.decisionExplanation.summaryLines` (V3 explainability slice). */
    decisionExplanationSummaryLines?: string[];
    /** Harness intent: real graph vs QA-only authority injection. */
    authorityResolutionSource?: "thread_sender_graph" | "qa_override";
    /** When the replay seeds a tenant `playbook_rules` row for policy tension (proof-only). */
    replayPlaybookRuleSeeded?: {
      seeded: boolean;
      ruleId?: string | null;
      actionKey?: string | null;
    };
  };
};

export type V3RealThreadReplaySnapshotExtras = {
  replaySeedMetadata?: Record<string, unknown>;
  expectedOutcomeSummary?: string;
  authorityResolutionSource?: "thread_sender_graph" | "qa_override";
  replayPlaybookRuleSeeded?: {
    seeded: boolean;
    ruleId?: string | null;
    actionKey?: string | null;
  };
};

const VERIFY_NOTE_MEMORY_TYPE = "v3_verify_case_note";

/** Matches `COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER` in orchestrator starvation module (substring only — no runtime import cycle). */
const STARVATION_ACTION_CONSTRAINT_SUBSTRING = "COMMERCIAL_FINANCIAL_STARVATION";

const MULTI_ACTOR_AUTHORITY_CONSTRAINT_SUBSTRING = "Multi-actor authority";

/** True when `action_constraints` includes the commercial starvation fallback line (replay observability). */
export function orchestratorContextInjectionHasStarvationConstraint(
  injection: OrchestratorContextInjection | null | undefined,
): boolean {
  if (!injection?.action_constraints?.length) return false;
  return injection.action_constraints.some((c) => c.includes(STARVATION_ACTION_CONSTRAINT_SUBSTRING));
}

/** True when `action_constraints` includes multi-actor planner/payer/signer refinement (replay observability). */
export function orchestratorContextInjectionHasMultiActorAuthorityConstraint(
  injection: OrchestratorContextInjection | null | undefined,
): boolean {
  if (!injection?.action_constraints?.length) return false;
  return injection.action_constraints.some((c) => c.includes(MULTI_ACTOR_AUTHORITY_CONSTRAINT_SUBSTRING));
}

function extractAuthorityPolicyProposalKeys(proposals: OrchestratorProposalCandidate[]): string[] {
  const keys = new Set<string>();
  for (const p of proposals) {
    if (p.action_key.includes("authority")) keys.add(p.action_key);
    const anyP = p as { authority_policy_reason_code?: string };
    if (typeof anyP.authority_policy_reason_code === "string" && anyP.authority_policy_reason_code.length > 0) {
      keys.add(p.action_key);
    }
  }
  return [...keys].sort();
}

function buildPolicyVsMemoryTensionNote(params: {
  merged: "draft_only" | "ask_first" | "forbidden" | null;
  memoryTypes: string[];
}): string | undefined {
  if (!params.memoryTypes.includes(VERIFY_NOTE_MEMORY_TYPE)) return undefined;
  const m = params.merged;
  if (m === "ask_first" || m === "draft_only" || m === "forbidden") {
    return `Effective playbook merge strongest mode is ${m}; verify-note memory is present — structured memory does not replace playbook (truth hierarchy).`;
  }
  return "Effective playbook merge is baseline (auto-capable); verify-note still coerces safer handling in auto mode — memory does not silently grant auto-send.";
}

function retrievalTraceFromHeavy(
  heavy: OrchestratorHeavyContextLayers | undefined,
): DecisionContextRetrievalTrace | null {
  return heavy?.retrievalTrace ?? null;
}

function chosenCandidateKeys(core: ClientOrchestratorV1CoreResult): {
  actionKey: string | null;
  likelyOutcome: string | null;
} {
  const c = core.chosenCandidate as OrchestratorProposalCandidate | null;
  if (!c) return { actionKey: null, likelyOutcome: null };
  return { actionKey: c.action_key, likelyOutcome: c.likely_outcome };
}

function personaReplaySummary(core: ClientOrchestratorV1CoreResult): V3RealThreadReplaySnapshot["persona"] {
  const p = core.personaOutputAuditor;
  if (p === undefined) {
    return {
      pathAttempted: false,
      outputAuditorPassed: null,
      outputAuditorRan: false,
      skipOrViolationSummary: "personaOutputAuditor not present on result",
    };
  }
  if (p.ran === false) {
    return {
      pathAttempted: true,
      outputAuditorPassed: null,
      outputAuditorRan: false,
      skipOrViolationSummary: p.reason ?? "skipped",
    };
  }
  if (p.passed) {
    return {
      pathAttempted: true,
      outputAuditorPassed: true,
      outputAuditorRan: true,
      skipOrViolationSummary: null,
    };
  }
  return {
    pathAttempted: true,
    outputAuditorPassed: false,
    outputAuditorRan: true,
    skipOrViolationSummary: (p.violations ?? []).slice(0, 6).join("; ") || "failed",
  };
}

/**
 * Builds a bounded JSON-serializable snapshot for markdown/JSON reports.
 * Pass `qaHeavyContextLayers` from `executeClientOrchestratorV1Core` when `qaIncludeHeavyContextLayers: true`.
 */
export function buildV3RealThreadReplaySnapshot(
  scenarioId: string,
  scenarioTitle: string,
  expectedRealManagerNote: string,
  honestDivergenceFromRealManager: string,
  core: ClientOrchestratorV1CoreResult,
  qaHeavyContextLayers?: OrchestratorHeavyContextLayers,
  extras?: V3RealThreadReplaySnapshotExtras,
): V3RealThreadReplaySnapshot {
  const vr = core.verifierResult as AgentResult<Record<string, unknown>>;
  const verifierFacts =
    vr && typeof vr === "object" && "facts" in vr && vr.facts && typeof vr.facts === "object"
      ? (vr.facts as Record<string, unknown>)
      : undefined;
  const vf = extractVerifierReplaySurface(verifierFacts);

  const heavy = qaHeavyContextLayers;
  const rt = retrievalTraceFromHeavy(heavy);
  const selectedIds =
    rt?.selectedMemoryIdsResolved ??
    core.orchestratorContextInjection.retrieval_observation.selected_memory_ids ??
    [];
  const gkIds =
    rt?.globalKnowledgeIdsLoaded ??
    core.orchestratorContextInjection.retrieval_observation.global_knowledge_ids_loaded ??
    [];

  const rawCount = heavy?.rawPlaybookRules.length ?? core.heavyContextSummary.rawPlaybookRuleCount;
  const effCount = heavy?.playbookRules.length ?? core.heavyContextSummary.playbookRuleCount;
  const exCount = heavy?.authorizedCaseExceptions.length ?? core.heavyContextSummary.authorizedCaseExceptionCount;

  const diffs =
    heavy && heavy.rawPlaybookRules.length > 0 && heavy.playbookRules.length > 0
      ? buildAuthorizedExceptionPolicyDiffs(heavy.rawPlaybookRules, heavy.playbookRules)
      : [];

  const { actionKey, likelyOutcome } = chosenCandidateKeys(core);

  const memoryTypes = (heavy?.selectedMemories ?? []).map((m) => m.type);
  const mergedFromVerifierFacts = parseMergedPlaybookModeFromVerifierFacts(verifierFacts);
  const legacyMergeAll =
    heavy && heavy.playbookRules.length > 0
      ? mergePlaybookDecisionModes(
          heavy.playbookRules.map((r) => ({
            id: r.id,
            action_key: r.action_key,
            decision_mode: r.decision_mode,
            topic: r.topic,
            is_active: r.is_active,
          })),
        )
      : null;
  const mergedPlaybookStrongestMode: "draft_only" | "ask_first" | "forbidden" | null =
    mergedFromVerifierFacts !== undefined ? mergedFromVerifierFacts : legacyMergeAll;

  const hasReplaySlice =
    extras?.expectedOutcomeSummary !== undefined ||
    extras?.replaySeedMetadata !== undefined ||
    extras?.authorityResolutionSource !== undefined ||
    extras?.replayPlaybookRuleSeeded !== undefined ||
    heavy !== undefined ||
    (core.decisionExplanation?.summaryLines?.length ?? 0) > 0;

  const replayBlock: V3RealThreadReplaySnapshot["replay"] = hasReplaySlice
      ? {
          expectedOutcomeSummary: extras?.expectedOutcomeSummary,
          seedMetadata: extras?.replaySeedMetadata,
          inboundSenderAuthority: heavy?.inboundSenderAuthority
            ? {
                bucket: heavy.inboundSenderAuthority.bucket,
                isApprovalContact: heavy.inboundSenderAuthority.isApprovalContact,
                source: heavy.inboundSenderAuthority.source,
                personId: heavy.inboundSenderAuthority.personId,
              }
            : undefined,
          mergedPlaybookStrongestMode,
          authorityPolicyProposalActionKeys: extractAuthorityPolicyProposalKeys(core.proposedActions ?? []),
          hydratedSelectedMemoryTypes: memoryTypes,
          policyVsMemoryTensionNote: buildPolicyVsMemoryTensionNote({
            merged: mergedPlaybookStrongestMode,
            memoryTypes,
          }),
          commercialStarvationConstraintInjected: orchestratorContextInjectionHasStarvationConstraint(
            core.orchestratorContextInjection,
          ),
          multiActorAuthorityConstraintInjected: orchestratorContextInjectionHasMultiActorAuthorityConstraint(
            core.orchestratorContextInjection,
          ),
          authorityResolutionSource: extras?.authorityResolutionSource,
          replayPlaybookRuleSeeded: extras?.replayPlaybookRuleSeeded,
          decisionExplanationSummaryLines: core.decisionExplanation?.summaryLines,
        }
      : undefined;

  return {
    schema: "v3_real_thread_replay_v1",
    scenarioId,
    scenarioTitle,
    expectedRealManagerNote,
    honestDivergenceFromRealManager,
    context: {
      selectedMemoriesCount: core.heavyContextSummary.selectedMemoriesCount,
      selectedMemoryIds: selectedIds,
      globalKnowledgeCount: core.heavyContextSummary.globalKnowledgeCount,
      globalKnowledgeIdsLoaded: gkIds,
      retrievalTrace: rt,
      rawPlaybookRuleCount: rawCount,
      authorizedCaseExceptionCount: exCount,
      effectivePlaybookRuleCount: effCount,
      authorizedExceptionPolicyDiffs: diffs,
      anyRuleOverriddenByAuthorizedException: diffs.length > 0,
    },
    verifier: {
      success: core.verifierResult.success,
      verifierStage: vf.verifierStage,
      reasonCodes: vf.reasonCodes,
      policyVerdict: vf.policyVerdict,
      pipelineHaltsBeforeExternalSend: vf.pipelineHaltsBeforeExternalSend,
      policyEvaluationActionKey: parsePolicyEvaluationActionKey(verifierFacts),
      policyRelevantPlaybookRuleIds: parsePolicyRelevantRuleIds(verifierFacts),
      mergedPlaybookDecisionModeFromRelevantRules:
        mergedFromVerifierFacts !== undefined ? mergedFromVerifierFacts : undefined,
      ...(typeof vr.error === "string" && vr.error.length > 0 ? { error: vr.error } : {}),
    },
    orchestrator: {
      outcome: core.orchestratorOutcome,
      proposalCount: core.proposalCount,
      chosenActionKey: actionKey,
      chosenLikelyOutcome: likelyOutcome,
    },
    persona: personaReplaySummary(core),
    orchestratorContextInjectionTraceLine:
      core.orchestratorContextInjection.retrieval_observation.trace_line ?? null,
    ...(replayBlock ? { replay: replayBlock } : {}),
  };
}

export function formatV3RealThreadReplayMarkdown(snapshots: V3RealThreadReplaySnapshot[]): string {
  const lines: string[] = [];
  lines.push("# V3 real-thread replay proof");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Method");
  lines.push("");
  lines.push("- Harness: [`supabase/functions/_shared/qa/v3RealThreadReplayReport.ts`](../supabase/functions/_shared/qa/v3RealThreadReplayReport.ts) + `executeClientOrchestratorV1Core` (`qaIncludeHeavyContextLayers`).");
  lines.push("- Compares upgraded runtime context + verifier + orchestrator + persona auditor signals — **not** a full human wedding-manager replay.");
  lines.push("");
  lines.push("## Scenarios");
  lines.push("");

  for (const s of snapshots) {
    lines.push(`### ${s.scenarioId} — ${s.scenarioTitle}`);
    lines.push("");
    lines.push("**Expected real-manager lens**");
    lines.push("");
    lines.push(s.expectedRealManagerNote);
    lines.push("");
    lines.push("**Honest divergence (automation vs real manager)**");
    lines.push("");
    lines.push(s.honestDivergenceFromRealManager);
    lines.push("");
    if (s.replay) {
      lines.push("**Replay slice (expected vs actual)**");
      lines.push("");
      if (s.replay.expectedOutcomeSummary) {
        lines.push(`- **Expected outcome summary:** ${s.replay.expectedOutcomeSummary}`);
      }
      if (s.replay.seedMetadata && Object.keys(s.replay.seedMetadata).length > 0) {
        lines.push(`- **Seed metadata:** \`${JSON.stringify(s.replay.seedMetadata)}\``);
      }
      if (s.replay.inboundSenderAuthority) {
        const a = s.replay.inboundSenderAuthority;
        lines.push(
          `- **Inbound sender authority:** bucket=\`${a.bucket}\`, isApprovalContact=${a.isApprovalContact}, source=\`${a.source}\`, personId=${a.personId ?? "(null)"}`,
        );
      }
      lines.push(
        `- **Merged playbook (action-key–scoped when verifier facts present):** ${s.replay.mergedPlaybookStrongestMode ?? "null (auto baseline)"}`,
      );
      lines.push(
        `- **Authorized exception active in context:** ${s.context.anyRuleOverriddenByAuthorizedException ? "yes (diffs present)" : "no"}`,
      );
      lines.push(
        `- **Policy overridden by authorized exception (effective merge):** ${s.context.anyRuleOverriddenByAuthorizedException ? "yes" : "no"}`,
      );
      lines.push(
        `- **Authority-policy proposal action_keys:** ${s.replay.authorityPolicyProposalActionKeys.join(", ") || "(none)"}`,
      );
      lines.push(`- **Hydrated memory types:** ${s.replay.hydratedSelectedMemoryTypes.join(", ") || "(none)"}`);
      if (s.replay.policyVsMemoryTensionNote) {
        lines.push(`- **Policy vs memory:** ${s.replay.policyVsMemoryTensionNote}`);
      }
      if (s.replay.commercialStarvationConstraintInjected !== undefined) {
        lines.push(
          `- **Commercial starvation constraint (action_constraints):** ${s.replay.commercialStarvationConstraintInjected ? "yes — payment terms not specifically grounded under current rules" : "no"}`,
        );
      }
      if (s.replay.multiActorAuthorityConstraintInjected !== undefined) {
        lines.push(
          `- **Multi-actor authority constraint (action_constraints):** ${s.replay.multiActorAuthorityConstraintInjected ? "yes — planner/payer/signer refinement injected" : "no"}`,
        );
      }
      if (s.replay.decisionExplanationSummaryLines && s.replay.decisionExplanationSummaryLines.length > 0) {
        lines.push("- **V3 decision explanation (bounded):**");
        for (const line of s.replay.decisionExplanationSummaryLines) {
          lines.push(`  - ${line}`);
        }
      }
      if (s.replay.authorityResolutionSource) {
        lines.push(`- **Authority resolution (harness):** \`${s.replay.authorityResolutionSource}\``);
      }
      if (s.replay.replayPlaybookRuleSeeded?.seeded) {
        const r = s.replay.replayPlaybookRuleSeeded;
        lines.push(
          `- **Replay-seeded playbook rule (policy baseline):** yes — ruleId=${r.ruleId ?? "(n/a)"}, action_key=\`${r.actionKey ?? "(n/a)"}\``,
        );
      }
      lines.push("");
      lines.push("| Actual | Value |");
      lines.push("|--------|-------|");
      lines.push(`| Verifier stage | ${s.verifier.verifierStage ?? "(n/a)"} |`);
      lines.push(`| Verifier reasonCodes | ${s.verifier.reasonCodes.join(", ") || "(none)"} |`);
      lines.push(`| Orchestrator outcome | \`${s.orchestrator.outcome}\` |`);
      lines.push("");
    }
    lines.push("**Context loaded**");
    lines.push("");
    lines.push(`| Signal | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| selectedMemoriesCount | ${s.context.selectedMemoriesCount} |`);
    lines.push(`| selectedMemoryIds (bounded) | ${s.context.selectedMemoryIds.slice(0, 12).join(", ") || "(none)"} |`);
    lines.push(`| globalKnowledgeCount | ${s.context.globalKnowledgeCount} |`);
    lines.push(`| globalKnowledgeIdsLoaded | ${s.context.globalKnowledgeIdsLoaded.slice(0, 12).join(", ") || "(none)"} |`);
    lines.push(`| rawPlaybookRuleCount | ${s.context.rawPlaybookRuleCount} |`);
    lines.push(`| authorizedCaseExceptionCount | ${s.context.authorizedCaseExceptionCount} |`);
    lines.push(`| effectivePlaybookRuleCount | ${s.context.effectivePlaybookRuleCount} |`);
    lines.push(`| anyRuleOverriddenByAuthorizedException | ${s.context.anyRuleOverriddenByAuthorizedException ? "yes" : "no"} |`);
    lines.push(`| retrieval trace line | ${s.orchestratorContextInjectionTraceLine ?? "(n/a)"} |`);
    lines.push("");
    if (s.context.retrievalTrace) {
      lines.push("**retrievalTrace**");
      lines.push("");
      lines.push(`- globalKnowledgeFetch: \`${s.context.retrievalTrace.globalKnowledgeFetch}\``);
      lines.push(`- globalKnowledgeGateDetail: ${s.context.retrievalTrace.globalKnowledgeGateDetail}`);
      lines.push("");
    }
    if (s.context.authorizedExceptionPolicyDiffs.length > 0) {
      lines.push("**Effective policy — authorized exception diffs (compact)**");
      lines.push("");
      lines.push("| action_key | source_rule_id | exception_id | changed |");
      lines.push("|------------|----------------|--------------|---------|");
      for (const d of s.context.authorizedExceptionPolicyDiffs) {
        const parts: string[] = [];
        if (d.changed_fields.decision_mode) {
          parts.push(`decision_mode: ${d.changed_fields.decision_mode.from}→${d.changed_fields.decision_mode.to}`);
        }
        if (d.changed_fields.instruction) {
          parts.push(`instruction: ${d.changed_fields.instruction}`);
        }
        lines.push(`| ${d.action_key} | ${d.source_rule_id} | ${d.exception_id} | ${parts.join("; ") || "(n/a)"} |`);
      }
      lines.push("");
    }
    lines.push("**Verifier (pre-generation)**");
    lines.push("");
    lines.push(`- success: ${s.verifier.success}`);
    lines.push(`- stage: ${s.verifier.verifierStage ?? "(n/a)"}`);
    lines.push(`- reasonCodes: ${s.verifier.reasonCodes.join(", ") || "(none)"}`);
    lines.push(`- policyVerdict: ${s.verifier.policyVerdict ?? "(n/a)"}`);
    if (s.verifier.policyEvaluationActionKey !== undefined && s.verifier.policyEvaluationActionKey !== null) {
      lines.push(`- policyEvaluationActionKey (verifier): \`${s.verifier.policyEvaluationActionKey}\``);
    }
    if (s.verifier.policyRelevantPlaybookRuleIds && s.verifier.policyRelevantPlaybookRuleIds.length > 0) {
      lines.push(
        `- policyRelevantPlaybookRuleIds: ${s.verifier.policyRelevantPlaybookRuleIds.slice(0, 16).join(", ")}`,
      );
    }
    if (s.verifier.mergedPlaybookDecisionModeFromRelevantRules !== undefined) {
      lines.push(
        `- mergedPlaybookDecisionModeFromRelevantRules: ${s.verifier.mergedPlaybookDecisionModeFromRelevantRules ?? "null (auto baseline)"}`,
      );
    }
    lines.push("");
    lines.push("**Orchestrator**");
    lines.push("");
    lines.push(`- outcome: \`${s.orchestrator.outcome}\``);
    lines.push(`- proposals: ${s.orchestrator.proposalCount}`);
    lines.push(`- chosen action_key: ${s.orchestrator.chosenActionKey ?? "(none)"}`);
    lines.push("");
    lines.push("**Persona / output auditor**");
    lines.push("");
    lines.push(`- path ran: ${s.persona.pathAttempted}`);
    lines.push(`- output auditor ran: ${s.persona.outputAuditorRan}`);
    lines.push(`- output auditor passed: ${s.persona.outputAuditorPassed === null ? "n/a" : s.persona.outputAuditorPassed}`);
    if (s.persona.skipOrViolationSummary) {
      lines.push(`- note: ${s.persona.skipOrViolationSummary}`);
    }
    lines.push("");
  }

  lines.push("## Aggregate limitations");
  lines.push("");
  lines.push("- Single-turn `executeClientOrchestratorV1Core` per scenario; no full thread timeline or CRM state evolution.");
  lines.push("- Real manager judgment (tone, relationship, unstated constraints) is **not** modeled; this report shows **system** signals only.");
  lines.push("");

  return lines.join("\n");
}
