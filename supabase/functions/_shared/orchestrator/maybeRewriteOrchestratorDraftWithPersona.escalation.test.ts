/**
 * Persona structured-output failure → escalation + operator draft marker (live operator paths).
 */
/* Edge functions use `Deno.env`; Vitest runs in Node — mirror `process.env` for env reads. */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../inngest.ts", () => ({
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION: 1,
}));
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import type { OrchestratorDraftAttemptResult } from "../../../../src/types/decisionContext.types.ts";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";

const { draftPersonaMock } = vi.hoisted(() => ({
  draftPersonaMock: vi.fn(),
}));

vi.mock("../persona/personaAgent.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../persona/personaAgent.ts")>();
  return { ...actual, draftPersonaStructuredResponse: draftPersonaMock };
});

const { recordEsc } = vi.hoisted(() => ({
  recordEsc: vi.fn().mockResolvedValue({ id: "esc-mock-1" }),
}));

vi.mock("./recordV3OutputAuditorEscalation.ts", () => ({
  recordV3OutputAuditorEscalation: recordEsc,
}));

import { maybeRewriteOrchestratorDraftWithPersona } from "./maybeRewriteOrchestratorDraftWithPersona.ts";
import {
  WEDDING_PAUSE_STATE_DB_ERROR,
  WEDDING_PAUSE_STATE_UNREADABLE,
} from "../fetchWeddingPauseFlags.ts";
import { WEDDING_AUTOMATION_PAUSED_SKIP_REASON } from "../weddingAutomationPause.ts";

function baseDc(threadId: string | null): DecisionContext {
  return {
    contextVersion: 1,
    photographerId: "p1",
    weddingId: "w1",
    threadId: threadId ?? "t1",
    replyChannel: "email",
    rawMessage: "",
    crmSnapshot: emptyCrmSnapshot(),
    recentMessages: [],
    threadSummary: null,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    audience: {
      threadParticipants: [],
      agencyCcLock: null,
      broadcastRisk: "low",
      recipientCount: 2,
      visibilityClass: "mixed_audience",
      clientVisibleForPrivateCommercialRedaction: true,
      approvalContactPersonIds: [],
    },
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
      selectedMemoryIdsResolved: [],
      selectedMemoriesLoadedCount: 0,
      globalKnowledgeIdsLoaded: [],
      globalKnowledgeLoadedCount: 0,
      globalKnowledgeFetch: "skipped_by_gate",
      globalKnowledgeGateDetail: "skipped_no_heuristic_signal",
    },
  } as DecisionContext;
}

const chosen: OrchestratorProposalCandidate = {
  id: "c1",
  action_family: "send_message",
  action_key: "send_message",
  rationale: "Follow up.",
  verifier_gating_required: false,
  likely_outcome: "draft",
  blockers_or_missing_facts: [],
};

function draftAttempt(): OrchestratorDraftAttemptResult {
  return {
    draftCreated: true,
    draftId: "draft-live-1",
    chosenCandidate: chosen,
  };
}

function buildSupabase(capture: { lastUpdate: Record<string, unknown> | null }) {
  const drafts = {
    select: vi.fn(() => drafts),
    eq: vi.fn(() => drafts),
    single: vi.fn(async () => ({ data: { instruction_history: [] }, error: null })),
    update: vi.fn((row: Record<string, unknown>) => {
      capture.lastUpdate = row;
      return {
        eq: vi.fn(async () => ({ error: null })),
      };
    }),
  };
  const photographers = {
    select: vi.fn(() => photographers),
    eq: vi.fn(() => photographers),
    maybeSingle: vi.fn(async () => ({ data: { settings: {} }, error: null })),
  };
  const weddings = {
    select: vi.fn(() => weddings),
    eq: vi.fn(() => weddings),
    maybeSingle: vi.fn(async () => ({
      data: { compassion_pause: false, strategic_pause: false },
      error: null,
    })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "drafts") return drafts;
      if (table === "photographers") return photographers;
      if (table === "weddings") return weddings;
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("maybeRewriteOrchestratorDraftWithPersona — persona structured output failure", () => {
  beforeEach(() => {
    vi.stubEnv("ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY", "1");
    draftPersonaMock.mockReset();
    recordEsc.mockReset();
    recordEsc.mockResolvedValue({ id: "esc-mock-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records escalation and returns escalation id when threadId is present", async () => {
    draftPersonaMock.mockRejectedValue(new Error("Bad control character in string literal in JSON"));
    const capture = { lastUpdate: null as Record<string, unknown> | null };
    const supabase = buildSupabase(capture);

    const result = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext: baseDc("thread-live"),
      draftAttempt: draftAttempt(),
      rawMessage: "Hello — can you share availability?",
      playbookRules: [],
      photographerId: "p1",
      replyChannel: "email",
      threadId: "thread-live",
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: true,
        auditPassed: false,
        draftId: "draft-live-1",
        escalationId: "esc-mock-1",
      }),
    );
    if (result.applied && !result.auditPassed) {
      expect(result.violations?.[0]).toMatch(/^persona_structured_output_failed:/);
    }

    expect(recordEsc).toHaveBeenCalledTimes(1);
    expect(recordEsc).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        photographerId: "p1",
        threadId: "thread-live",
        weddingId: "w1",
        draftId: "draft-live-1",
        variant: "persona_structured_output",
      }),
    );

    const body = capture.lastUpdate?.body as string | undefined;
    expect(body).toBe(
      "Reply draft pending — generated text will replace this when the writer runs successfully.",
    );
    expect(body).not.toContain("PERSONA DRAFT FAILED");
    expect(body).not.toContain("Action:");
    expect(body).not.toContain("Rationale:");

    const hist = capture.lastUpdate?.instruction_history as unknown[] | undefined;
    expect(hist?.length).toBe(2);
    const fail = hist?.[0] as Record<string, unknown>;
    expect(fail?.failed).toBe(true);
    expect(String(fail?.operator_notice ?? "")).toContain("Automated client-facing rewrite did not complete");
    const audit = hist?.[1] as Record<string, unknown>;
    expect(audit?.step).toBe("v3_persona_structured_output_escalation");
    expect(audit?.escalation_id).toBe("esc-mock-1");
  });

  it("does not call recordV3OutputAuditorEscalation when threadId is null (no live thread)", async () => {
    draftPersonaMock.mockRejectedValue(new Error("parse failed"));
    const capture = { lastUpdate: null as Record<string, unknown> | null };
    const supabase = buildSupabase(capture);

    const dc = baseDc(null);
    dc.threadId = null;

    const result = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext: dc,
      draftAttempt: draftAttempt(),
      rawMessage: "Hi",
      playbookRules: [],
      photographerId: "p1",
      replyChannel: "email",
      threadId: null,
    });

    expect(recordEsc).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        applied: true,
        auditPassed: false,
        escalationId: null,
      }),
    );
    const audit = (capture.lastUpdate?.instruction_history as unknown[])?.[1] as Record<string, unknown>;
    expect(audit?.escalation_id).toBeNull();
  });
});

describe("maybeRewriteOrchestratorDraftWithPersona — fresh wedding pause gate", () => {
  beforeEach(() => {
    vi.stubEnv("ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY", "1");
    draftPersonaMock.mockReset();
    recordEsc.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips persona LLM and draft updates when fresh wedding read shows pause (pre-LLM)", async () => {
    const capture = { lastUpdate: null as Record<string, unknown> | null };
    const drafts = {
      select: vi.fn(() => drafts),
      eq: vi.fn(() => drafts),
      single: vi.fn(async () => ({ data: { instruction_history: [] }, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    };
    const photographers = {
      select: vi.fn(() => photographers),
      eq: vi.fn(() => photographers),
      maybeSingle: vi.fn(async () => ({ data: { settings: {} }, error: null })),
    };
    const weddings = {
      select: vi.fn(() => weddings),
      eq: vi.fn(() => weddings),
      maybeSingle: vi.fn(async () => ({
        data: { compassion_pause: true, strategic_pause: false },
        error: null,
      })),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "photographers") return photographers;
        if (table === "weddings") return weddings;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    const result = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext: baseDc("thread-live"),
      draftAttempt: draftAttempt(),
      rawMessage: "Hello",
      playbookRules: [],
      photographerId: "p1",
      replyChannel: "email",
      threadId: "thread-live",
    });

    expect(result).toEqual({ applied: false, reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON });
    expect(draftPersonaMock).not.toHaveBeenCalled();
    expect(capture.lastUpdate).toBeNull();
  });

  it("skips persona LLM when fresh wedding row is missing (fail-closed)", async () => {
    const capture = { lastUpdate: null as Record<string, unknown> | null };
    const drafts = {
      select: vi.fn(() => drafts),
      eq: vi.fn(() => drafts),
      single: vi.fn(async () => ({ data: { instruction_history: [] }, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    };
    const photographers = {
      select: vi.fn(() => photographers),
      eq: vi.fn(() => photographers),
      maybeSingle: vi.fn(async () => ({ data: { settings: {} }, error: null })),
    };
    const weddings = {
      select: vi.fn(() => weddings),
      eq: vi.fn(() => weddings),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "photographers") return photographers;
        if (table === "weddings") return weddings;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    const result = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext: baseDc("thread-live"),
      draftAttempt: draftAttempt(),
      rawMessage: "Hello",
      playbookRules: [],
      photographerId: "p1",
      replyChannel: "email",
      threadId: "thread-live",
    });

    expect(result).toEqual({ applied: false, reason: WEDDING_PAUSE_STATE_UNREADABLE });
    expect(draftPersonaMock).not.toHaveBeenCalled();
    expect(capture.lastUpdate).toBeNull();
  });

  it("skips persona LLM when fresh wedding read returns DB error (fail-closed)", async () => {
    const capture = { lastUpdate: null as Record<string, unknown> | null };
    const drafts = {
      select: vi.fn(() => drafts),
      eq: vi.fn(() => drafts),
      single: vi.fn(async () => ({ data: { instruction_history: [] }, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    };
    const photographers = {
      select: vi.fn(() => photographers),
      eq: vi.fn(() => photographers),
      maybeSingle: vi.fn(async () => ({ data: { settings: {} }, error: null })),
    };
    const weddings = {
      select: vi.fn(() => weddings),
      eq: vi.fn(() => weddings),
      maybeSingle: vi.fn(async () => ({ data: null, error: { message: "db down" } })),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "photographers") return photographers;
        if (table === "weddings") return weddings;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    const result = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext: baseDc("thread-live"),
      draftAttempt: draftAttempt(),
      rawMessage: "Hello",
      playbookRules: [],
      photographerId: "p1",
      replyChannel: "email",
      threadId: "thread-live",
    });

    expect(result).toEqual({ applied: false, reason: WEDDING_PAUSE_STATE_DB_ERROR });
    expect(draftPersonaMock).not.toHaveBeenCalled();
    expect(capture.lastUpdate).toBeNull();
  });

  it("skips final draft update when pre-commit fresh read is unreadable after successful persona (fail-closed)", async () => {
    const capture = { lastUpdate: null as Record<string, unknown> | null };
    const drafts = {
      select: vi.fn(() => drafts),
      eq: vi.fn(() => drafts),
      single: vi.fn(async () => ({ data: { instruction_history: [] }, error: null })),
      update: vi.fn((row: Record<string, unknown>) => {
        capture.lastUpdate = row;
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
    };
    const photographers = {
      select: vi.fn(() => photographers),
      eq: vi.fn(() => photographers),
      maybeSingle: vi.fn(async () => ({ data: { settings: {} }, error: null })),
    };
    const weddings = {
      select: vi.fn(() => weddings),
      eq: vi.fn(() => weddings),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: { compassion_pause: false, strategic_pause: false },
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "photographers") return photographers;
        if (table === "weddings") return weddings;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    draftPersonaMock.mockResolvedValue({
      email_draft: "Hello — thank you for your note.\n\nWarmly,\nStudio",
      committed_terms: { package_names: [], deposit_percentage: null, travel_miles_included: null },
    });

    const result = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext: baseDc("thread-live"),
      draftAttempt: draftAttempt(),
      rawMessage: "Hello — can you share availability?",
      playbookRules: [],
      photographerId: "p1",
      replyChannel: "email",
      threadId: "thread-live",
    });

    expect(result).toEqual({ applied: false, reason: WEDDING_PAUSE_STATE_UNREADABLE });
    expect(draftPersonaMock).toHaveBeenCalled();
    expect(capture.lastUpdate).toBeNull();
  });
});

describe("maybeRewriteOrchestratorDraftWithPersona — persona disabled", () => {
  beforeEach(() => {
    draftPersonaMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns early without persona so A2 safe placeholder body is unchanged (no scaffolding added)", async () => {
    vi.stubEnv("ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY", "0");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const capture = { lastUpdate: null as Record<string, unknown> | null };
    const supabase = buildSupabase(capture);

    const result = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext: baseDc("t-persist"),
      draftAttempt: draftAttempt(),
      rawMessage: "Thanks — the timeline works for us.",
      playbookRules: [],
      photographerId: "p1",
      replyChannel: "email",
      threadId: "t-persist",
    });

    expect(result).toEqual({ applied: false, reason: "persona_writer_disabled_or_no_api_key" });
    expect(draftPersonaMock).not.toHaveBeenCalled();
    expect(capture.lastUpdate).toBeNull();
  });
});
