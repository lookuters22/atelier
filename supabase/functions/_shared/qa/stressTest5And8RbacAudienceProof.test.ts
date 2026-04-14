/**
 * Stress Test 5 & 8 — RBAC / audience safety proof (no DB).
 * ST5: agency CC / direct client / mixed shapes (Lavender & Rose).
 * ST8: planner + groom merge + unknown recipient conservatism (Mark/Jessica/Alex).
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
  STRESS_TEST_5_PRIVATE_COMMERCIAL_MEMORY,
  STRESS_TEST_7_CLEAN_DRAFT_SIMULATION,
  STRESS_TEST_7_LEAKY_DRAFT_SIMULATION,
  STRESS_TEST_8_PRIVATE_COMMERCIAL_MEMORY,
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

function dcForRedaction(
  memory: string,
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
    recentMessages: [{ id: "rm1", body: memory }],
    threadSummary: memory,
    memoryHeaders: [],
    selectedMemories: [
      {
        id: "m1",
        type: "v3_verify_case_note",
        title: "proof",
        summary: "s",
        full_content: memory,
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

describe("Stress Test 5 — audience classification", () => {
  it("agency CC mixed: planner + groom on outgoing recipients → mixed_audience (client present)", () => {
    const participants = [
      tp({ person_id: "agency", visibility_role: "wedding planner", is_recipient: true }),
      tp({ person_id: "groom", visibility_role: "groom", is_recipient: true, is_cc: true }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("mixed_audience");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });

  it("agency-internal only: planner + coordinator recipients → planner_only (no client on the wire)", () => {
    const participants = [
      tp({ person_id: "p1", visibility_role: "wedding planner" }),
      tp({ person_id: "p2", visibility_role: "coordinator" }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("planner_only");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(false);
  });

  it("direct client only (couple-facing): single groom → client_visible", () => {
    const participants = [tp({ person_id: "g", visibility_role: "groom" })];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("client_visible");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });
});

describe("Stress Test 5 — redaction + leakage auditor", () => {
  it("strips ST5-shaped private commercial memory when mixed or client-visible", () => {
    const mixed = applyAudiencePrivateCommercialRedaction(
      dcForRedaction(STRESS_TEST_5_PRIVATE_COMMERCIAL_MEMORY, {
        visibilityClass: "mixed_audience",
        clientVisibleForPrivateCommercialRedaction: true,
      }),
    );
    expect(mixed.selectedMemories[0].full_content).not.toMatch(/planner\s+commission/i);
    expect(mixed.selectedMemories[0].full_content).toContain("Redacted");
  });

  it("preserves planner-private ST5 notes for agency-internal (planner_only) audience", () => {
    const po = applyAudiencePrivateCommercialRedaction(
      dcForRedaction(STRESS_TEST_5_PRIVATE_COMMERCIAL_MEMORY, {
        visibilityClass: "planner_only",
        clientVisibleForPrivateCommercialRedaction: false,
      }),
    );
    expect(po.selectedMemories[0].full_content).toContain("agency fee");
  });

  it("leak auditor blocks leaky draft under enforcement; allows when planner-only", () => {
    expect(auditPlannerPrivateLeakage(STRESS_TEST_7_LEAKY_DRAFT_SIMULATION, true).isValid).toBe(false);
    expect(auditPlannerPrivateLeakage(STRESS_TEST_7_LEAKY_DRAFT_SIMULATION, false).isValid).toBe(true);
    expect(auditPlannerPrivateLeakage(STRESS_TEST_7_CLEAN_DRAFT_SIMULATION, true).isValid).toBe(true);
  });
});

describe("Stress Test 8 — audience classification (merge / ambiguous outreach)", () => {
  it("planner + groom merged thread → mixed_audience (same conservative rule as ST5 CC)", () => {
    const participants = [
      tp({ person_id: "planner", visibility_role: "wedding planner" }),
      tp({ person_id: "groom", visibility_role: "groom", is_cc: false }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("mixed_audience");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });

  it("planner + unknown visibility_role → mixed_audience (unknown treated as client-facing per RBAC plan)", () => {
    const participants = [
      tp({ person_id: "planner", visibility_role: "wedding planner" }),
      tp({ person_id: "new_email", visibility_role: "" }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("mixed_audience");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });

  it("outgoing recipients exclude sender so classification matches orchestrator load", () => {
    const participants = [
      tp({ person_id: "groom", is_sender: true, is_recipient: false }),
      tp({ person_id: "planner", visibility_role: "wedding planner", is_sender: false }),
    ];
    expect(outgoingRecipientParticipants(participants)).toHaveLength(1);
    const r = resolveAudienceVisibility(outgoingRecipientParticipants(participants), new Map());
    expect(r.visibilityClass).toBe("planner_only");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(false);
  });
});

describe("Stress Test 8 — redaction + leakage auditor", () => {
  it("ST8-shaped memory redacts for client-visible / mixed", () => {
    const dc = applyAudiencePrivateCommercialRedaction(
      dcForRedaction(STRESS_TEST_8_PRIVATE_COMMERCIAL_MEMORY, {
        visibilityClass: "mixed_audience",
        clientVisibleForPrivateCommercialRedaction: true,
      }),
    );
    expect(dc.selectedMemories[0].full_content).not.toMatch(/agency\s+fee/i);
    expect(dc.threadSummary).toContain("Redacted");
  });
});
