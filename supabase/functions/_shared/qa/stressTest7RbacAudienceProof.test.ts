/**
 * Stress Test 7 — RBAC / audience safety proof (no DB).
 * Pass criteria align with docs/v3/V3_RBAC_AUDIENCE_PLAN.md Phase 4 and REAL_CONVERSATION_STRESS_TEST_PLAN.md (commission secrecy).
 */
import { describe, expect, it } from "vitest";
import { applyAudiencePrivateCommercialRedaction } from "../context/applyAudiencePrivateCommercialRedaction.ts";
import {
  outgoingRecipientParticipants,
  resolveAudienceVisibility,
} from "../context/resolveAudienceVisibility.ts";
import { auditPlannerPrivateLeakage } from "../orchestrator/auditPlannerPrivateLeakage.ts";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import type { ThreadParticipantAudienceRow } from "../../../../src/types/decisionContext.types.ts";
import {
  STRESS_TEST_7_CLEAN_DRAFT_SIMULATION,
  STRESS_TEST_7_LEAKY_DRAFT_SIMULATION,
  STRESS_TEST_7_PRIVATE_COMMERCIAL_MEMORY,
} from "./stressTestAudienceFixtures.ts";

function tp(
  partial: Partial<ThreadParticipantAudienceRow> & Pick<ThreadParticipantAudienceRow, "person_id">,
): ThreadParticipantAudienceRow {
  return {
    id: partial.id ?? "id",
    thread_id: partial.thread_id ?? "thread",
    visibility_role: partial.visibility_role ?? "",
    is_cc: partial.is_cc ?? false,
    is_recipient: partial.is_recipient ?? true,
    is_sender: partial.is_sender ?? false,
    person_id: partial.person_id,
  };
}

function decisionContextForRedaction(
  audience: Pick<
    DecisionContext["audience"],
    "visibilityClass" | "clientVisibleForPrivateCommercialRedaction"
  >,
): DecisionContext {
  return {
    contextVersion: 1,
    photographerId: "p",
    weddingId: "w",
    threadId: "t",
    replyChannel: "email",
    rawMessage: "",
    crmSnapshot: emptyCrmSnapshot(),
    recentMessages: [
      { id: "rm1", body: STRESS_TEST_7_PRIVATE_COMMERCIAL_MEMORY },
    ],
    threadSummary: STRESS_TEST_7_PRIVATE_COMMERCIAL_MEMORY,
    memoryHeaders: [],
    selectedMemories: [
      {
        id: "m1",
        type: "v3_verify_case_note",
        title: "ST7",
        summary: "note",
        full_content: STRESS_TEST_7_PRIVATE_COMMERCIAL_MEMORY,
      },
    ],
    globalKnowledge: [],
    candidateWeddingIds: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
    threadDraftsSummary: null,
    inboundSenderIdentity: null,
    inboundSenderAuthority: {
      bucket: "unknown",
      personId: null,
      isApprovalContact: false,
      source: "unresolved",
    },
    retrievalTrace: {
      selectedMemoryIdsResolved: ["m1"],
      selectedMemoriesLoadedCount: 1,
      globalKnowledgeIdsLoaded: [],
      globalKnowledgeLoadedCount: 0,
      globalKnowledgeFetch: "queried",
      globalKnowledgeGateDetail: "query_memory_promotion",
    },
    audience: {
      threadParticipants: [],
      agencyCcLock: null,
      broadcastRisk: "unknown",
      recipientCount: 0,
      approvalContactPersonIds: [],
      visibilityClass: audience.visibilityClass,
      clientVisibleForPrivateCommercialRedaction: audience.clientVisibleForPrivateCommercialRedaction,
    },
  } as DecisionContext;
}

describe("Stress Test 7 — audience classification (outgoing recipients)", () => {
  it("planner-only thread: two planner-side recipients → planner_only, no client-safe enforcement flag", () => {
    const participants = [
      tp({ person_id: "a", visibility_role: "wedding planner", is_sender: false }),
      tp({ person_id: "b", visibility_role: "coordinator", is_sender: false }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("planner_only");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(false);
  });

  it("client-visible negotiation thread: couple recipient → redaction enforced", () => {
    const participants = [tp({ person_id: "c", visibility_role: "bride", is_sender: false })];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("client_visible");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });

  it("mixed planner + client on To/CC → mixed_audience, treated as client-visible for redaction", () => {
    const participants = [
      tp({ person_id: "p", visibility_role: "wedding planner", is_sender: false, is_recipient: true }),
      tp({ person_id: "c", visibility_role: "bride", is_sender: false, is_cc: true }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("mixed_audience");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });

  it("outgoingRecipientParticipants matches orchestrator audience load (excludes sender)", () => {
    const participants = [
      tp({ person_id: "s", is_sender: true, is_recipient: false, is_cc: false }),
      tp({ person_id: "p", visibility_role: "wedding planner", is_sender: false }),
    ];
    expect(outgoingRecipientParticipants(participants)).toHaveLength(1);
  });
});

describe("Stress Test 7 — upstream redaction before writer input", () => {
  it("strips planner-private commercial phrases when clientVisibleForPrivateCommercialRedaction is true", () => {
    const dc = applyAudiencePrivateCommercialRedaction(
      decisionContextForRedaction({
        visibilityClass: "client_visible",
        clientVisibleForPrivateCommercialRedaction: true,
      }),
    );
    expect(dc.selectedMemories[0].full_content).not.toMatch(/planner\s+commission/i);
    expect(dc.selectedMemories[0].full_content).toContain("Redacted");
    expect(dc.threadSummary).toContain("Redacted");
    expect(dc.recentMessages[0].body).toContain("Redacted");
  });

  it("preserves planner-private context for planner_only (no redaction)", () => {
    const dc = applyAudiencePrivateCommercialRedaction(
      decisionContextForRedaction({
        visibilityClass: "planner_only",
        clientVisibleForPrivateCommercialRedaction: false,
      }),
    );
    expect(dc.selectedMemories[0].full_content).toContain("Planner commission");
    expect(dc.threadSummary).toContain("Internal negotiation");
  });

  it("mixed_audience uses same redaction path as client_visible", () => {
    const dc = applyAudiencePrivateCommercialRedaction(
      decisionContextForRedaction({
        visibilityClass: "mixed_audience",
        clientVisibleForPrivateCommercialRedaction: true,
      }),
    );
    expect(dc.selectedMemories[0].full_content).not.toMatch(/agency\s+fee/i);
  });
});

describe("Stress Test 7 — verifier backstop (auditPlannerPrivateLeakage)", () => {
  it("blocks leaky draft when enforcement matches client-visible redaction flag", () => {
    const r = auditPlannerPrivateLeakage(STRESS_TEST_7_LEAKY_DRAFT_SIMULATION, true);
    expect(r.isValid).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it("allows same leaky wording when audience is planner-only (enforcement off)", () => {
    const r = auditPlannerPrivateLeakage(STRESS_TEST_7_LEAKY_DRAFT_SIMULATION, false);
    expect(r.isValid).toBe(true);
  });

  it("allows clean draft under enforcement", () => {
    const r = auditPlannerPrivateLeakage(STRESS_TEST_7_CLEAN_DRAFT_SIMULATION, true);
    expect(r.isValid).toBe(true);
  });
});

