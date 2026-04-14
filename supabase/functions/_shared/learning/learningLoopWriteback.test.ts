import { afterEach, describe, expect, it, vi } from "vitest";
import { Constants } from "../../../../src/types/database.types.ts";
import { OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION } from "../../../../src/types/operatorResolutionWriteback.types.ts";
import * as classifyOutcome from "../classifyEscalationLearningOutcome.ts";
import * as classifyLoop from "./classifyOperatorResolutionLearningLoop.ts";
import * as upsertPolicy from "../policy/upsertAuthorizedCaseExceptionFromEscalationResolution.ts";
import { classifyOperatorResolutionLearningLoop } from "./classifyOperatorResolutionLearningLoop.ts";
import { executeLearningLoopEscalationResolution } from "./executeLearningLoopEscalationResolution.ts";
import {
  OperatorResolutionWritebackEnvelopeSchema,
  safeParseOperatorResolutionWritebackEnvelope,
} from "./operatorResolutionWritebackZod.ts";

const photographerId = "550e8400-e29b-41d4-a716-446655440000";
const escalationId = "660e8400-e29b-41d4-a716-446655440001";
const weddingId = "770e8400-e29b-41d4-a716-446655440002";
const threadId = "880e8400-e29b-41d4-a716-446655440003";

function baseEnvelope() {
  return {
    schemaVersion: OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION,
    photographerId,
    correlation: {
      escalationId,
      threadId,
      weddingId,
      operatorResolutionSummary: "summary",
      rawOperatorText: "raw",
    },
    artifacts: [
      {
        kind: "authorized_case_exception" as const,
        overridesActionKey: "travel_fee",
        targetPlaybookRuleId: null,
        overridePayload: { waive: true },
        effectiveFromIso: new Date().toISOString(),
        effectiveUntilIso: null,
        notes: null,
      },
    ],
  };
}

describe("OperatorResolutionWritebackEnvelopeSchema (Zod)", () => {
  it("accepts a valid envelope", () => {
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(baseEnvelope());
    expect(r.success).toBe(true);
  });

  it("rejects invalid decision_mode enum", () => {
    const e = {
      ...baseEnvelope(),
      artifacts: [
        {
          kind: "playbook_rule_candidate" as const,
          proposedActionKey: "x",
          topic: "t",
          proposedInstruction: "i",
          proposedDecisionMode: "not_a_mode",
          proposedScope: "global",
        },
      ],
    };
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it("rejects confidence outside [0, 1]", () => {
    const e = {
      ...baseEnvelope(),
      artifacts: [
        {
          kind: "playbook_rule_candidate" as const,
          proposedActionKey: "x",
          topic: "t",
          proposedInstruction: "i",
          proposedDecisionMode: Constants.public.Enums.decision_mode[0],
          proposedScope: "global",
          confidence: 2,
        },
      ],
    };
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it("rejects observationCount < 1 when present", () => {
    const e = {
      ...baseEnvelope(),
      artifacts: [
        {
          kind: "playbook_rule_candidate" as const,
          proposedActionKey: "x",
          topic: "t",
          proposedInstruction: "i",
          proposedDecisionMode: Constants.public.Enums.decision_mode[0],
          proposedScope: "global",
          observationCount: 0,
        },
      ],
    };
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it("rejects extra keys (.strict)", () => {
    const e = {
      ...baseEnvelope(),
      artifacts: [
        {
          ...baseEnvelope().artifacts[0],
          hallucinatedKey: true,
        },
      ],
    };
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it("rejects duplicate overridesActionKey on two exceptions", () => {
    const ex = {
      kind: "authorized_case_exception" as const,
      overridesActionKey: "same_key",
      targetPlaybookRuleId: null,
      overridePayload: {},
    };
    const e = {
      ...baseEnvelope(),
      artifacts: [ex, { ...ex, overridePayload: { a: 1 } }],
    };
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it("rejects memory whose memoryType matches an exception overridesActionKey", () => {
    const e = {
      ...baseEnvelope(),
      artifacts: [
        {
          kind: "authorized_case_exception" as const,
          overridesActionKey: "travel_fee",
          targetPlaybookRuleId: null,
          overridePayload: {},
        },
        {
          kind: "memory" as const,
          memoryType: "travel_fee",
          title: "Note",
          summary: "s",
          fullContent: "context only",
        },
      ],
    };
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it("rejects memory text that repeats an exception action key substring", () => {
    const e = {
      ...baseEnvelope(),
      artifacts: [
        {
          kind: "authorized_case_exception" as const,
          overridesActionKey: "travel_fee",
          targetPlaybookRuleId: null,
          overridePayload: {},
        },
        {
          kind: "memory" as const,
          memoryType: "note",
          title: "Reminder",
          summary: "Fee",
          fullContent: "We waived travel_fee for this wedding.",
        },
      ],
    };
    const r = OperatorResolutionWritebackEnvelopeSchema.safeParse(e);
    expect(r.success).toBe(false);
  });

  it("safeParse returns VALIDATION_FAILED with issues", () => {
    const r = safeParseOperatorResolutionWritebackEnvelope({ foo: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues).toBeDefined();
  });
});

describe("classifyOperatorResolutionLearningLoop", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fails closed when OPENAI_API_KEY missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const out = await classifyOperatorResolutionLearningLoop({
      operatorResolutionText: "x",
      photographerId,
      escalationContext: {
        escalationId,
        threadId,
        weddingId,
        actionKey: "k",
        questionBody: "q",
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("MISSING_API_KEY");
  });
});

describe("executeLearningLoopEscalationResolution (single RPC)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls supabase.rpc exactly once for learning loop completion", async () => {
    vi.spyOn(classifyOutcome, "classifyEscalationLearningOutcome").mockResolvedValue("one_off_case");
    vi.spyOn(classifyLoop, "classifyOperatorResolutionLearningLoop").mockResolvedValue({
      ok: true,
      data: {
        artifacts: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "travel_fee",
            targetPlaybookRuleId: null,
            overridePayload: { waived: true },
          },
          {
            kind: "memory",
            memoryType: "preference",
            title: "Second shooter",
            summary: "Remind extra cost",
            fullContent: "Second shooter is an add-on.",
          },
        ],
      },
    });
    vi.spyOn(upsertPolicy, "fetchPlaybookRuleIdForTenantActionKey").mockResolvedValue(null);

    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "completed",
        created_exception_ids: ["e1"],
        created_memory_ids: ["m1"],
        created_candidate_ids: [],
        closed_escalation_id: escalationId,
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: escalationId,
              photographer_id: photographerId,
              status: "open",
              question_body: "Q",
              action_key: "travel_fee",
              reason_code: "r",
              wedding_id: weddingId,
              thread_id: threadId,
            },
            error: null,
          }),
        }),
      }),
    });
    const supabase = { from, rpc } as never;

    const result = await executeLearningLoopEscalationResolution(supabase, {
      photographerId,
      escalationId,
      resolutionSummary: "sum",
      photographerReplyRaw:
        "Waive the travel fee this one time, but remind them the second shooter is extra.",
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("complete_learning_loop_operator_resolution");
    if (result.ok) {
      expect(result.receipt.created_exception_ids).toEqual(["e1"]);
      expect(result.receipt.created_memory_ids).toEqual(["m1"]);
      expect(result.receipt.correlation.escalationId).toBe(escalationId);
    }
  });

  it("answered + learning_loop: single RPC idempotent path without classifier calls", async () => {
    const classifyOutcomeSpy = vi.spyOn(classifyOutcome, "classifyEscalationLearningOutcome");
    const classifyLoopSpy = vi.spyOn(classifyLoop, "classifyOperatorResolutionLearningLoop");

    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "already_completed",
        created_exception_ids: ["e1"],
        created_memory_ids: ["m1"],
        created_candidate_ids: [],
        closed_escalation_id: escalationId,
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: escalationId,
              photographer_id: photographerId,
              status: "answered",
              resolution_storage_target: "learning_loop",
              learning_outcome: "one_off_case",
              question_body: "Q",
              action_key: "travel_fee",
              reason_code: "r",
              wedding_id: weddingId,
              thread_id: threadId,
            },
            error: null,
          }),
        }),
      }),
    });
    const supabase = { from, rpc } as never;

    const result = await executeLearningLoopEscalationResolution(supabase, {
      photographerId,
      escalationId,
      resolutionSummary: "sum",
      photographerReplyRaw: "retry body",
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(classifyOutcomeSpy).not.toHaveBeenCalled();
    expect(classifyLoopSpy).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.receipt.status).toBe("already_completed");
      expect(result.learningOutcome).toBe("one_off_case");
    }
  });
});

describe("Learning loop scenario (Zod only)", () => {
  it("accepts non-overlapping travel waiver + second-shooter memory", () => {
    const envelope = {
      schemaVersion: OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION,
      photographerId,
      correlation: { escalationId, threadId, weddingId },
      artifacts: [
        {
          kind: "authorized_case_exception" as const,
          overridesActionKey: "travel_fee",
          targetPlaybookRuleId: null,
          overridePayload: { waive_once: true },
        },
        {
          kind: "memory" as const,
          memoryType: "commercial_reminder",
          title: "Second shooter",
          summary: "Not included; extra fee applies.",
          fullContent: "Remind the couple second shooter is an add-on.",
        },
      ],
    };
    const r = safeParseOperatorResolutionWritebackEnvelope(envelope);
    expect(r.ok).toBe(true);
  });
});
