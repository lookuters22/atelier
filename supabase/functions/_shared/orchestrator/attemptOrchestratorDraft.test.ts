import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

vi.mock("../inngest.ts", () => ({
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION: 1,
}));

import { attemptOrchestratorDraft, buildOrchestratorStubDraftBody } from "./attemptOrchestratorDraft.ts";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";

function blockedSendMessage(): OrchestratorProposalCandidate {
  return {
    id: "cand-1-send_message",
    action_family: "send_message",
    action_key: "send_message",
    rationale: "test",
    verifier_gating_required: true,
    likely_outcome: "block",
    blockers_or_missing_facts: ["workflow_timeline_suppressed_other_channel:whatsapp"],
  };
}

describe("attemptOrchestratorDraft", () => {
  it("does not insert a draft when the only send_message candidate is workflow-blocked (likely_outcome block)", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "draft-id" }, error: null }),
      }),
    });
    const supabase = {
      from: (table: string) => {
        if (table === "drafts") return { insert };
        return {};
      },
    } as unknown as SupabaseClient;

    const result = await attemptOrchestratorDraft(supabase, {
      photographerId: "p1",
      threadId: "t1",
      proposedActions: [blockedSendMessage()],
      verifierSuccess: true,
      orchestratorOutcome: "draft",
      rawMessage: "hello",
      replyChannel: "email",
      playbookRules: [],
    });

    expect(result.draftCreated).toBe(false);
    expect(result.skipReason).toBe("no_draftable_send_message_candidate");
    expect(insert).not.toHaveBeenCalled();
  });

  it("drafts the disambiguation send_message when routine primary is identity-blocked", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const insert = vi.fn((row: Record<string, unknown>) => {
      capturedBody = row;
      return {
        select: () => ({
          single: async () => ({ data: { id: "draft-disamb" }, error: null }),
        }),
      };
    });
    const supabase = {
      from: (table: string) => {
        if (table === "drafts") return { insert };
        return {};
      },
    } as unknown as SupabaseClient;

    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "cand-1-send_message",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "routine",
        verifier_gating_required: true,
        likely_outcome: "block",
        blockers_or_missing_facts: ["identity_thread_multi_wedding"],
      },
      {
        id: "cand-2-disambiguation",
        action_family: "send_message",
        action_key: "v3_wedding_identity_disambiguation",
        rationale: "Ask which wedding.",
        verifier_gating_required: true,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
      },
    ];

    const result = await attemptOrchestratorDraft(supabase, {
      photographerId: "p1",
      threadId: "t1",
      proposedActions: proposals,
      verifierSuccess: true,
      orchestratorOutcome: "draft",
      rawMessage: "hello",
      replyChannel: "email",
      playbookRules: [],
    });

    expect(result.draftCreated).toBe(true);
    expect(result.chosenCandidate?.action_key).toBe("v3_wedding_identity_disambiguation");
    expect(insert).toHaveBeenCalled();
    const hist = (capturedBody?.instruction_history as unknown[])?.[0] as Record<string, unknown> | undefined;
    expect(hist?.action_key).toBe("v3_wedding_identity_disambiguation");
  });

  it("redacts planner-private phrasing in persisted stub body when clientVisibleForPrivateCommercialRedaction is true", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const insert = vi.fn((row: Record<string, unknown>) => {
      capturedBody = row;
      return {
        select: () => ({
          single: async () => ({ data: { id: "draft-rbac" }, error: null }),
        }),
      };
    });
    const supabase = {
      from: (table: string) => {
        if (table === "drafts") return { insert };
        return {};
      },
    } as unknown as SupabaseClient;

    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "cand-send",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "Escalation: align planner commission with venue coordinator.",
        verifier_gating_required: false,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
      },
    ];

    const raw = "We discussed internal negotiation on agency fee with the planner.";

    await attemptOrchestratorDraft(supabase, {
      photographerId: "p1",
      threadId: "t1",
      proposedActions: proposals,
      verifierSuccess: true,
      orchestratorOutcome: "draft",
      rawMessage: raw,
      replyChannel: "email",
      playbookRules: [],
      audience: { clientVisibleForPrivateCommercialRedaction: true },
    });

    const body = String(capturedBody?.body ?? "");
    expect(body).not.toMatch(/planner\s+commission/i);
    expect(body).not.toMatch(/agency\s+fee/i);
    expect(body).toContain("[Orchestrator draft — clientOrchestratorV1 QA path]");
  });

  it("does not redact stub body when clientVisibleForPrivateCommercialRedaction is false", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const insert = vi.fn((row: Record<string, unknown>) => {
      capturedBody = row;
      return {
        select: () => ({
          single: async () => ({ data: { id: "draft-planner" }, error: null }),
        }),
      };
    });
    const supabase = {
      from: (table: string) => {
        if (table === "drafts") return { insert };
        return {};
      },
    } as unknown as SupabaseClient;

    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "cand-send",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "Planner commission is 10% with agency.",
        verifier_gating_required: false,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
      },
    ];

    await attemptOrchestratorDraft(supabase, {
      photographerId: "p1",
      threadId: "t1",
      proposedActions: proposals,
      verifierSuccess: true,
      orchestratorOutcome: "draft",
      rawMessage: "hello",
      replyChannel: "email",
      playbookRules: [],
      audience: { clientVisibleForPrivateCommercialRedaction: false },
    });

    expect(String(capturedBody?.body ?? "")).toContain("Planner commission is 10%");
  });
});

describe("buildOrchestratorStubDraftBody — audience redaction", () => {
  const base: OrchestratorProposalCandidate = {
    id: "c1",
    action_family: "send_message",
    action_key: "send_message",
    rationale: "Note internal markup on extras.",
    verifier_gating_required: false,
    likely_outcome: "draft",
    blockers_or_missing_facts: [],
  };

  it("applies multiline redaction for client-visible audience", () => {
    const out = buildOrchestratorStubDraftBody(base, "Discuss agency fee.", "email", [], {
      clientVisibleForPrivateCommercialRedaction: true,
    });
    expect(out).not.toMatch(/agency\s+fee/i);
    expect(out).toContain("[Orchestrator draft — clientOrchestratorV1 QA path]");
  });

  it("preserves stub text for planner-only (no redaction flag)", () => {
    const out = buildOrchestratorStubDraftBody(base, "Discuss agency fee.", "email", [], {
      clientVisibleForPrivateCommercialRedaction: false,
    });
    expect(out).toContain("Discuss agency fee.");
  });
});
