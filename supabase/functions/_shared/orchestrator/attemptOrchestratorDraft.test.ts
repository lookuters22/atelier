import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

vi.mock("../inngest.ts", () => ({
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION: 1,
}));

import { WEDDING_PAUSE_STATE_DB_ERROR } from "../fetchWeddingPauseFlags.ts";
import { WEDDING_AUTOMATION_PAUSED_SKIP_REASON } from "../weddingAutomationPause.ts";
import {
  ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER,
  attemptOrchestratorDraft,
  buildOrchestratorStubDraftBody,
} from "./attemptOrchestratorDraft.ts";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";

/** Resolves wedding for pause gate; `weddings` is only queried when `threadWeddingId` is non-null. */
function supabaseChainsForOrchestratorDraft(opts: {
  insert?: ReturnType<typeof vi.fn>;
  threadWeddingId?: string | null;
  weddingRow?: { compassion_pause: boolean; strategic_pause: boolean } | null;
  weddingError?: { message: string } | null;
}): SupabaseClient {
  const insert =
    opts.insert ??
    vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "draft-id" }, error: null }),
      }),
    }));
  const threadWeddingId = opts.threadWeddingId === undefined ? null : opts.threadWeddingId;
  return {
    from: (table: string) => {
      if (table === "drafts") return { insert };
      if (table === "threads") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { wedding_id: threadWeddingId },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (opts.weddingError) {
                    return { data: null, error: opts.weddingError };
                  }
                  const row = opts.weddingRow ?? {
                    compassion_pause: false,
                    strategic_pause: false,
                  };
                  return { data: row, error: null };
                },
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as SupabaseClient;
}

const FORBIDDEN_BODY_SUBSTRINGS = [
  "Action:",
  "Rationale:",
  "[Orchestrator draft",
  "v3_authority_policy",
  "clientOrchestratorV1",
];

function expectNoInternalScaffolding(body: string) {
  for (const s of FORBIDDEN_BODY_SUBSTRINGS) {
    expect(body).not.toContain(s);
  }
}

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
    const supabase = supabaseChainsForOrchestratorDraft({ insert });

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

  it("does not insert when wedding life-event pause is active (crmSnapshotForPause)", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "draft-id" }, error: null }),
      }),
    });
    const supabase = supabaseChainsForOrchestratorDraft({ insert });

    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "cand-1-send_message",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "test",
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
      crmSnapshotForPause: { compassion_pause: false, strategic_pause: true },
    });

    expect(result.draftCreated).toBe(false);
    expect(result.skipReason).toBe(WEDDING_AUTOMATION_PAUSED_SKIP_REASON);
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not insert when fresh weddings row shows pause even if CRM snapshot is unpaused (stale CRM)", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "draft-id" }, error: null }),
      }),
    });
    const supabase = supabaseChainsForOrchestratorDraft({
      insert,
      threadWeddingId: "w-fresh-paused",
      weddingRow: { compassion_pause: true, strategic_pause: false },
    });

    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "cand-1-send_message",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "test",
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
      crmSnapshotForPause: { compassion_pause: false, strategic_pause: false },
    });

    expect(result.draftCreated).toBe(false);
    expect(result.skipReason).toBe(WEDDING_AUTOMATION_PAUSED_SKIP_REASON);
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not insert when fresh pause read errors (fail closed)", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "draft-id" }, error: null }),
      }),
    });
    const supabase = supabaseChainsForOrchestratorDraft({
      insert,
      threadWeddingId: "w-db",
      weddingError: { message: "timeout" },
    });

    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "cand-1-send_message",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "test",
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

    expect(result.draftCreated).toBe(false);
    expect(result.skipReason).toBe(WEDDING_PAUSE_STATE_DB_ERROR);
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
    const supabase = supabaseChainsForOrchestratorDraft({ insert });

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
    const body = String(capturedBody?.body ?? "");
    expect(body).toBe(ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER);
    expectNoInternalScaffolding(body);
    expect(String(hist?.orchestrator_rationale ?? "")).toContain("Ask which wedding.");
  });

  it("persists safe placeholder body only; rationale and inbound live in instruction_history (client-visible redaction on metadata)", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const insert = vi.fn((row: Record<string, unknown>) => {
      capturedBody = row;
      return {
        select: () => ({
          single: async () => ({ data: { id: "draft-rbac" }, error: null }),
        }),
      };
    });
    const supabase = supabaseChainsForOrchestratorDraft({ insert });

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
    expect(body).toBe(ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER);
    expectNoInternalScaffolding(body);

    const hist = (capturedBody?.instruction_history as unknown[])?.[0] as Record<string, unknown> | undefined;
    expect(String(hist?.orchestrator_rationale ?? "")).not.toMatch(/planner\s+commission/i);
    expect(String(hist?.inbound_excerpt ?? "")).not.toMatch(/agency\s+fee/i);
  });

  it("planner-only audience keeps diagnostics unredacted in instruction_history", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const insert = vi.fn((row: Record<string, unknown>) => {
      capturedBody = row;
      return {
        select: () => ({
          single: async () => ({ data: { id: "draft-planner" }, error: null }),
        }),
      };
    });
    const supabase = supabaseChainsForOrchestratorDraft({ insert });

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

    expect(String(capturedBody?.body ?? "")).toBe(ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER);
    const hist = (capturedBody?.instruction_history as unknown[])?.[0] as Record<string, unknown> | undefined;
    expect(String(hist?.orchestrator_rationale ?? "")).toContain("Planner commission is 10%");
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

  it("returns only safe placeholder for client-visible audience (no inbound or rationale in body)", () => {
    const out = buildOrchestratorStubDraftBody(base, "Discuss agency fee.", "email", [], {
      clientVisibleForPrivateCommercialRedaction: true,
    });
    expect(out).toBe(ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER);
    expectNoInternalScaffolding(out);
  });

  it("returns only safe placeholder when redaction flag is false", () => {
    const out = buildOrchestratorStubDraftBody(base, "Discuss agency fee.", "email", [], {
      clientVisibleForPrivateCommercialRedaction: false,
    });
    expect(out).toBe(ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER);
    expect(out).not.toContain("Discuss agency fee.");
  });
});
