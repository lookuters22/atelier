import { describe, expect, it } from "vitest";
import type { ClientOrchestratorV1CoreResult } from "../orchestrator/clientOrchestratorV1Core.ts";
import {
  buildAuthorizedExceptionPolicyDiffs,
  buildV3RealThreadReplaySnapshot,
  extractVerifierReplaySurface,
  formatV3RealThreadReplayMarkdown,
  orchestratorContextInjectionHasStarvationConstraint,
  orchestratorContextInjectionHasMultiActorAuthorityConstraint,
} from "./v3RealThreadReplayReport.ts";
import type { EffectivePlaybookRule, PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";

function baseRule(
  id: string,
  actionKey: string,
  instruction: string,
): PlaybookRuleContextRow {
  return {
    id,
    action_key: actionKey,
    instruction,
    decision_mode: "auto",
    scope: "global",
    topic: "t",
    photographer_id: "p1",
    channel: null,
    confidence_label: "explicit",
    source_type: "seed",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as PlaybookRuleContextRow;
}

describe("v3RealThreadReplayReport", () => {
  it("buildAuthorizedExceptionPolicyDiffs surfaces decision_mode + instruction class", () => {
    const raw = [baseRule("r1", "send_message", "Base instruction")];
    const effective: EffectivePlaybookRule[] = [
      {
        ...raw[0],
        decision_mode: "draft_only",
        instruction: "Base instruction\n\nAppendix from exception",
        effectiveDecisionSource: "authorized_exception",
        appliedAuthorizedExceptionId: "ex1",
      },
    ];
    const diffs = buildAuthorizedExceptionPolicyDiffs(raw, effective);
    expect(diffs.length).toBe(1);
    expect(diffs[0].exception_id).toBe("ex1");
    expect(diffs[0].changed_fields.decision_mode).toEqual({ from: "auto", to: "draft_only" });
    expect(diffs[0].changed_fields.instruction).toBe("appended");
  });

  it("orchestratorContextInjectionHasMultiActorAuthorityConstraint matches Multi-actor authority substring", () => {
    expect(
      orchestratorContextInjectionHasMultiActorAuthorityConstraint({
        approved_supporting_facts: [],
        action_constraints: ["Multi-actor authority (planner schedule change): test"],
        retrieval_observation: {} as never,
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      } as never),
    ).toBe(true);
    expect(
      orchestratorContextInjectionHasMultiActorAuthorityConstraint({
        approved_supporting_facts: [],
        action_constraints: ["no marker here"],
        retrieval_observation: {} as never,
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      } as never),
    ).toBe(false);
  });

  it("orchestratorContextInjectionHasStarvationConstraint matches COMMERCIAL_FINANCIAL_STARVATION substring", () => {
    expect(
      orchestratorContextInjectionHasStarvationConstraint({
        approved_supporting_facts: [],
        action_constraints: ["prefix COMMERCIAL_FINANCIAL_STARVATION suffix"],
        retrieval_observation: {} as never,
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      } as never),
    ).toBe(true);
    expect(
      orchestratorContextInjectionHasStarvationConstraint({
        approved_supporting_facts: [],
        action_constraints: ["no marker here"],
        retrieval_observation: {} as never,
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      } as never),
    ).toBe(false);
    expect(orchestratorContextInjectionHasStarvationConstraint(null)).toBe(false);
    expect(orchestratorContextInjectionHasStarvationConstraint(undefined)).toBe(false);
  });

  it("extractVerifierReplaySurface reads stage and reason codes", () => {
    const v = extractVerifierReplaySurface({
      verifierStage: "draft_only",
      reasonCodes: ["V3_VERIFIER_SAFE"],
      policyVerdict: "require_draft_only",
      pipelineHaltsBeforeExternalSend: true,
    });
    expect(v.verifierStage).toBe("draft_only");
    expect(v.reasonCodes).toContain("V3_VERIFIER_SAFE");
  });

  it("buildV3RealThreadReplaySnapshot stays bounded (no raw memory bodies)", () => {
    const core = {
      schemaVersion: 1,
      photographerId: "p1",
      heavyContextSummary: {
        selectedMemoriesCount: 2,
        globalKnowledgeCount: 1,
        playbookRuleCount: 3,
        rawPlaybookRuleCount: 3,
        authorizedCaseExceptionCount: 0,
        audience: { visibilityClass: "client_visible" },
        escalationOpenCount: 0,
        escalationOpenIds: [],
        threadDraftsSummary: null,
        weddingCrmParityHints: null,
      },
      proposedActions: [],
      proposalCount: 0,
      verifierResult: {
        success: true,
        facts: {
          verifierStage: "allow_auto",
          reasonCodes: ["V3_VERIFIER_SAFE"],
          policyVerdict: "allow_auto",
        },
      },
      draftAttempt: { draftCreated: false, draftId: null, chosenCandidate: null, skipReason: "x" },
      escalationAttempt: {
        escalationArtifactCreated: false,
        toolEscalateSuccess: false,
        escalationFacts: null,
        toolEscalateError: null,
        chosenCandidateForEscalation: null,
      },
      chosenCandidate: null,
      draftCreated: false,
      escalationArtifactCreated: false,
      neitherDraftNorEscalationReason: null,
      calculatorResult: null,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: {
        approved_supporting_facts: [],
        action_constraints: [],
        retrieval_observation: {
          selected_memory_ids: ["m1", "m2"],
          global_knowledge_ids_loaded: ["k1"],
          global_knowledge_fetch: "queried",
          global_knowledge_gate_detail: "ok",
          trace_line: "memories=2",
        },
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      },
    } as unknown as ClientOrchestratorV1CoreResult;

    const snap = buildV3RealThreadReplaySnapshot(
      "unit",
      "unit",
      "n/a",
      "n/a",
      core,
      undefined,
    );
    expect(snap.context.selectedMemoryIds).toEqual(["m1", "m2"]);
    expect(JSON.stringify(snap)).not.toMatch(/planner commission/i);
  });

  it("formatV3RealThreadReplayMarkdown includes exception diff table when diffs present", () => {
    const raw = [baseRule("r1", "send_message", "Base")];
    const effective: EffectivePlaybookRule[] = [
      {
        ...raw[0],
        decision_mode: "draft_only",
        instruction: "Override",
        effectiveDecisionSource: "authorized_exception",
        appliedAuthorizedExceptionId: "ex9",
      },
    ];
    const heavy = {
      rawPlaybookRules: raw,
      playbookRules: effective,
      authorizedCaseExceptions: [{ id: "ex9" } as never],
      retrievalTrace: {
        selectedMemoryIdsResolved: [],
        selectedMemoriesLoadedCount: 0,
        globalKnowledgeIdsLoaded: [],
        globalKnowledgeLoadedCount: 0,
        globalKnowledgeFetch: "skipped_by_gate",
        globalKnowledgeGateDetail: "gate",
      },
    } as never;

    const core = {
      heavyContextSummary: {
        selectedMemoriesCount: 0,
        globalKnowledgeCount: 0,
        playbookRuleCount: 1,
        rawPlaybookRuleCount: 1,
        authorizedCaseExceptionCount: 1,
        audience: {},
        escalationOpenCount: 0,
        escalationOpenIds: [],
        threadDraftsSummary: null,
        weddingCrmParityHints: null,
      },
      verifierResult: { success: true, facts: {} },
      orchestratorOutcome: "draft",
      proposalCount: 1,
      chosenCandidate: null,
      orchestratorContextInjection: {
        approved_supporting_facts: [],
        action_constraints: [],
        retrieval_observation: {
          selected_memory_ids: [],
          global_knowledge_ids_loaded: [],
          global_knowledge_fetch: "skipped_by_gate",
          global_knowledge_gate_detail: "x",
          trace_line: "t",
        },
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      },
    } as unknown as ClientOrchestratorV1CoreResult;

    const snap = buildV3RealThreadReplaySnapshot(
      "auth-exception",
      "Auth exception",
      "e",
      "d",
      core,
      heavy,
    );
    expect(snap.context.authorizedExceptionPolicyDiffs.length).toBeGreaterThan(0);
    const md = formatV3RealThreadReplayMarkdown([snap]);
    expect(md).toContain("Effective policy — authorized exception diffs");
    expect(md).toContain("ex9");
    expect(md).toContain("Replay slice (expected vs actual)");
    expect(md).toContain("Merged playbook (action-key–scoped when verifier facts present)");
  });

  it("buildV3RealThreadReplaySnapshot reads action-key–scoped verifier policy facts when present", () => {
    const core = {
      heavyContextSummary: {
        selectedMemoriesCount: 0,
        globalKnowledgeCount: 0,
        playbookRuleCount: 2,
        rawPlaybookRuleCount: 2,
        authorizedCaseExceptionCount: 0,
        audience: {},
        escalationOpenCount: 0,
        escalationOpenIds: [],
        threadDraftsSummary: null,
        weddingCrmParityHints: null,
      },
      proposedActions: [],
      verifierResult: {
        success: true,
        facts: {
          verifierStage: "draft_only",
          reasonCodes: ["X"],
          policyVerdict: "require_draft_only",
          policyEvaluationActionKey: "v3_rtrp_replay_vendor_delivery_high_res",
          policyRelevantPlaybookRuleIds: ["pr-1"],
          mergedPlaybookDecisionModeFromRelevantRules: "draft_only",
        },
      },
      orchestratorOutcome: "draft",
      proposalCount: 0,
      chosenCandidate: null,
      orchestratorContextInjection: {
        approved_supporting_facts: [],
        action_constraints: [],
        retrieval_observation: {
          selected_memory_ids: [],
          global_knowledge_ids_loaded: [],
          global_knowledge_fetch: "skipped_by_gate",
          global_knowledge_gate_detail: "x",
          trace_line: "t",
        },
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      },
    } as unknown as ClientOrchestratorV1CoreResult;

    const heavy = {
      rawPlaybookRules: [
        {
          id: "noise",
          action_key: "send_message",
          decision_mode: "forbidden",
          instruction: "x",
          scope: "global",
          topic: "t",
          photographer_id: "p1",
          channel: null,
          confidence_label: "explicit",
          source_type: "seed",
          is_active: true,
          created_at: "",
          updated_at: "",
        },
      ],
      playbookRules: [
        {
          id: "noise",
          action_key: "send_message",
          decision_mode: "forbidden",
          instruction: "x",
          scope: "global",
          topic: "t",
          photographer_id: "p1",
          channel: null,
          confidence_label: "explicit",
          source_type: "seed",
          is_active: true,
          created_at: "",
          updated_at: "",
          effectiveDecisionSource: "playbook" as const,
          appliedAuthorizedExceptionId: null,
        },
      ],
      authorizedCaseExceptions: [],
      retrievalTrace: {
        selectedMemoryIdsResolved: [],
        selectedMemoriesLoadedCount: 0,
        globalKnowledgeIdsLoaded: [],
        globalKnowledgeLoadedCount: 0,
        globalKnowledgeFetch: "skipped_by_gate" as const,
        globalKnowledgeGateDetail: "gate",
      },
    } as never;

    const snap = buildV3RealThreadReplaySnapshot("pol", "pol", "e", "d", core, heavy);
    expect(snap.verifier.policyEvaluationActionKey).toBe("v3_rtrp_replay_vendor_delivery_high_res");
    expect(snap.verifier.policyRelevantPlaybookRuleIds).toEqual(["pr-1"]);
    expect(snap.replay?.mergedPlaybookStrongestMode).toBe("draft_only");
  });

  it("buildV3RealThreadReplaySnapshot surfaces decisionExplanationSummaryLines in replay + markdown", () => {
    const core = {
      heavyContextSummary: {
        selectedMemoriesCount: 0,
        globalKnowledgeCount: 0,
        playbookRuleCount: 1,
        rawPlaybookRuleCount: 1,
        authorizedCaseExceptionCount: 0,
        audience: {},
        escalationOpenCount: 0,
        escalationOpenIds: [],
        threadDraftsSummary: null,
        weddingCrmParityHints: null,
      },
      proposedActions: [],
      verifierResult: { success: true, facts: {} },
      orchestratorOutcome: "draft",
      proposalCount: 0,
      chosenCandidate: null,
      orchestratorContextInjection: {
        approved_supporting_facts: [],
        action_constraints: [],
        retrieval_observation: {
          selected_memory_ids: [],
          global_knowledge_ids_loaded: [],
          global_knowledge_fetch: "skipped_by_gate",
          global_knowledge_gate_detail: "x",
          trace_line: "t",
        },
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      },
      decisionExplanation: {
        summaryLines: ["Line A — outcome draft", "Line B — policy"],
      },
    } as unknown as ClientOrchestratorV1CoreResult;

    const snap = buildV3RealThreadReplaySnapshot("expl", "expl", "e", "d", core, undefined);
    expect(snap.replay?.decisionExplanationSummaryLines).toEqual(["Line A — outcome draft", "Line B — policy"]);
    const md = formatV3RealThreadReplayMarkdown([snap]);
    expect(md).toContain("V3 decision explanation (bounded):");
    expect(md).toContain("Line A — outcome draft");
  });

  it("buildV3RealThreadReplaySnapshot passes through fidelity extras (authority source + seeded playbook)", () => {
    const core = {
      heavyContextSummary: {
        selectedMemoriesCount: 0,
        globalKnowledgeCount: 0,
        playbookRuleCount: 1,
        rawPlaybookRuleCount: 1,
        authorizedCaseExceptionCount: 0,
        audience: {},
        escalationOpenCount: 0,
        escalationOpenIds: [],
        threadDraftsSummary: null,
        weddingCrmParityHints: null,
      },
      proposedActions: [],
      verifierResult: { success: true, facts: {} },
      orchestratorOutcome: "draft",
      proposalCount: 0,
      chosenCandidate: null,
      orchestratorContextInjection: {
        approved_supporting_facts: [],
        action_constraints: [],
        retrieval_observation: {
          selected_memory_ids: [],
          global_knowledge_ids_loaded: [],
          global_knowledge_fetch: "skipped_by_gate",
          global_knowledge_gate_detail: "x",
          trace_line: "t",
        },
        memory_digest_lines: [],
        global_knowledge_digest_lines: [],
      },
    } as unknown as ClientOrchestratorV1CoreResult;

    const snap = buildV3RealThreadReplaySnapshot("fidelity", "fidelity", "e", "d", core, undefined, {
      authorityResolutionSource: "thread_sender_graph",
      replayPlaybookRuleSeeded: { seeded: true, ruleId: "rule-1", actionKey: "v3_rtrp_replay_vendor_high_res" },
    });
    expect(snap.replay?.authorityResolutionSource).toBe("thread_sender_graph");
    expect(snap.replay?.replayPlaybookRuleSeeded?.ruleId).toBe("rule-1");
  });
});
