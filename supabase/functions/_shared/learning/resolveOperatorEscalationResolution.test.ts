import { afterEach, describe, expect, it, vi } from "vitest";
import * as classifyOutcome from "../classifyEscalationLearningOutcome.ts";
import * as completeAtomic from "../completeEscalationResolutionAtomic.ts";
import * as holdModule from "../operator/threadV3OperatorHold.ts";
import * as executeLearning from "./executeLearningLoopEscalationResolution.ts";
import { resolveOperatorEscalationResolution } from "./resolveOperatorEscalationResolution.ts";
import * as storageTarget from "../resolveStrictEscalationStorageTarget.ts";

const photographerId = "550e8400-e29b-41d4-a716-446655440000";
const escalationId = "660e8400-e29b-41d4-a716-446655440001";

function makeSupabase(row: Record<string, unknown>) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    }),
  } as never;
}

const openRowBase = {
  id: escalationId,
  photographer_id: photographerId,
  status: "open",
  question_body: "Q?",
  action_key: "discount_quote",
  reason_code: "pricing",
  decision_justification: {},
  wedding_id: null,
  thread_id: null,
  learning_outcome: null,
  resolution_storage_target: null,
};

describe("resolveOperatorEscalationResolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to executeLearningLoopEscalationResolution when strict target is not documents", async () => {
    const clearHoldSpy = vi.spyOn(holdModule, "clearV3OperatorHoldForResolvedEscalation").mockResolvedValue();
    vi.spyOn(storageTarget, "resolveStrictEscalationStorageTarget").mockReturnValue("memories");
    vi.spyOn(classifyOutcome, "classifyEscalationLearningOutcome").mockResolvedValue("one_off_case");

    const elSpy = vi.spyOn(executeLearning, "executeLearningLoopEscalationResolution").mockResolvedValue({
      ok: true,
      receipt: {
        status: "completed",
        created_exception_ids: [],
        created_memory_ids: [],
        created_candidate_ids: [],
        closed_escalation_id: escalationId,
        correlation: {},
      },
      learningOutcome: "one_off_case",
    });

    const atomicSpy = vi.spyOn(completeAtomic, "completeEscalationResolutionAtomic");

    const supabase = makeSupabase({ ...openRowBase });

    const result = await resolveOperatorEscalationResolution(supabase, {
      photographerId,
      escalationId,
      resolutionSummary: "sum",
      photographerReplyRaw: "ok",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("learning_loop");
    expect(elSpy).toHaveBeenCalledTimes(1);
    expect(elSpy.mock.calls[0][1]).toMatchObject({
      learningOutcome: "one_off_case",
    });
    expect(atomicSpy).not.toHaveBeenCalled();
    expect(clearHoldSpy).toHaveBeenCalledTimes(1);
    expect(clearHoldSpy).toHaveBeenCalledWith(supabase, {
      photographerId,
      escalationId,
      clientThreadId: null,
    });
  });

  it("delegates to completeEscalationResolutionAtomic when strict target is documents (legacy)", async () => {
    const clearHoldSpy = vi.spyOn(holdModule, "clearV3OperatorHoldForResolvedEscalation").mockResolvedValue();
    vi.spyOn(storageTarget, "resolveStrictEscalationStorageTarget").mockReturnValue("documents");
    vi.spyOn(classifyOutcome, "classifyEscalationLearningOutcome").mockResolvedValue("one_off_case");

    const elSpy = vi.spyOn(executeLearning, "executeLearningLoopEscalationResolution");

    vi.spyOn(completeAtomic, "completeEscalationResolutionAtomic").mockResolvedValue({
      branch: "document",
      documentId: "doc-1",
    });

    const supabase = makeSupabase({ ...openRowBase });

    const result = await resolveOperatorEscalationResolution(supabase, {
      photographerId,
      escalationId,
      resolutionSummary: "sum",
      photographerReplyRaw: "ok",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("legacy_atomic");
    expect(result.writeback.branch).toBe("document");
    expect(elSpy).not.toHaveBeenCalled();
    expect(clearHoldSpy).toHaveBeenCalledTimes(1);
    expect(clearHoldSpy).toHaveBeenCalledWith(supabase, {
      photographerId,
      escalationId,
      clientThreadId: null,
    });
  });

  it("idempotent answered + learning_loop calls executeLearningLoop only (no classify)", async () => {
    const clearHoldSpy = vi.spyOn(holdModule, "clearV3OperatorHoldForResolvedEscalation").mockResolvedValue();
    vi.spyOn(classifyOutcome, "classifyEscalationLearningOutcome");
    vi.spyOn(storageTarget, "resolveStrictEscalationStorageTarget");

    vi.spyOn(executeLearning, "executeLearningLoopEscalationResolution").mockResolvedValue({
      ok: true,
      receipt: {
        status: "already_completed",
        created_exception_ids: ["e1"],
        created_memory_ids: [],
        created_candidate_ids: [],
        closed_escalation_id: escalationId,
        correlation: {},
      },
      learningOutcome: "one_off_case",
    });

    const supabase = makeSupabase({
      ...openRowBase,
      status: "answered",
      resolution_storage_target: "learning_loop",
      learning_outcome: "one_off_case",
    });

    const result = await resolveOperatorEscalationResolution(supabase, {
      photographerId,
      escalationId,
      resolutionSummary: "sum",
      photographerReplyRaw: "retry",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("learning_loop");
    expect(result.receipt.status).toBe("already_completed");
    expect(classifyOutcome.classifyEscalationLearningOutcome).not.toHaveBeenCalled();
    expect(storageTarget.resolveStrictEscalationStorageTarget).not.toHaveBeenCalled();
    expect(clearHoldSpy).toHaveBeenCalledTimes(1);
  });

  it("uses prefetchedLearningOutcome and skips classifyEscalationLearningOutcome", async () => {
    const classifySpy = vi.spyOn(classifyOutcome, "classifyEscalationLearningOutcome");
    vi.spyOn(storageTarget, "resolveStrictEscalationStorageTarget").mockReturnValue("memories");
    vi.spyOn(executeLearning, "executeLearningLoopEscalationResolution").mockResolvedValue({
      ok: true,
      receipt: {
        status: "completed",
        created_exception_ids: [],
        created_memory_ids: [],
        created_candidate_ids: [],
        closed_escalation_id: escalationId,
        correlation: {},
      },
      learningOutcome: "reusable_playbook",
    });

    const supabase = makeSupabase({ ...openRowBase });
    const result = await resolveOperatorEscalationResolution(supabase, {
      photographerId,
      escalationId,
      resolutionSummary: "sum",
      photographerReplyRaw: "ok",
      prefetchedLearningOutcome: "reusable_playbook",
    });

    expect(result.ok).toBe(true);
    expect(classifySpy).not.toHaveBeenCalled();
    const el = executeLearning.executeLearningLoopEscalationResolution;
    expect(el).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        learningOutcome: "reusable_playbook",
      }),
    );
  });

  it("does not clear operator hold when resolution fails", async () => {
    const clearHoldSpy = vi.spyOn(holdModule, "clearV3OperatorHoldForResolvedEscalation").mockResolvedValue();
    vi.spyOn(storageTarget, "resolveStrictEscalationStorageTarget").mockReturnValue("memories");
    vi.spyOn(classifyOutcome, "classifyEscalationLearningOutcome").mockResolvedValue("one_off_case");
    vi.spyOn(executeLearning, "executeLearningLoopEscalationResolution").mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_FAILED", issues: { formErrors: [], fieldErrors: {} } },
    });

    const supabase = makeSupabase({ ...openRowBase });
    const result = await resolveOperatorEscalationResolution(supabase, {
      photographerId,
      escalationId,
      resolutionSummary: "sum",
      photographerReplyRaw: "ok",
    });

    expect(result.ok).toBe(false);
    expect(clearHoldSpy).not.toHaveBeenCalled();
  });
});
