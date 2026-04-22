import { describe, expect, it, vi } from "vitest";
import { completeEscalationResolutionAtomic } from "./completeEscalationResolutionAtomic.ts";

vi.mock("./resolveStrictEscalationStorageTarget.ts", () => ({
  resolveStrictEscalationStorageTarget: () => "memories" as const,
}));

vi.mock("./policy/extractAuthorizedCaseExceptionPayloadFromOperatorText.ts", () => ({
  extractAuthorizedCaseExceptionPayloadFromOperatorText: vi.fn(),
}));

import { extractAuthorizedCaseExceptionPayloadFromOperatorText } from "./policy/extractAuthorizedCaseExceptionPayloadFromOperatorText.ts";

describe("completeEscalationResolutionAtomic", () => {
  it("authorized path: single RPC commits exception + escalation (no orphan artifact without answered)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "exc-1", error: null });
    const supabase = { rpc } as never;

    vi.mocked(extractAuthorizedCaseExceptionPayloadFromOperatorText).mockResolvedValue({
      ok: true,
      applies_policy_override: true,
      override_payload: { decision_mode: "auto" },
      effective_until_iso: null,
    } as never);

    const fetchRule = vi.fn().mockResolvedValue("rule-1");
    const upsertMod = await import("./policy/upsertAuthorizedCaseExceptionFromEscalationResolution.ts");
    vi.spyOn(upsertMod, "fetchPlaybookRuleIdForTenantActionKey").mockImplementation(fetchRule);

    const r = await completeEscalationResolutionAtomic(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      learningOutcome: "one_off_case",
      reasonCode: "x",
      actionKey: "send_message",
      decisionJustification: {},
      weddingId: "w1",
      questionBody: "q",
      resolutionSummary: "ok",
      photographerReplyRaw: "yes override",
      clientThreadId: null,
    });

    expect(r.branch).toBe("authorized_case_exception");
    expect((r as { exceptionId: string }).exceptionId).toBe("exc-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("complete_escalation_resolution_authorized_case_exception");
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_learning_outcome).toBe("one_off_case");
    expect(args.p_escalation_id).toBe("e1");
  });

  it("memory path: uses complete_escalation_resolution_memory (atomic branch)", async () => {
    vi.mocked(extractAuthorizedCaseExceptionPayloadFromOperatorText).mockResolvedValue({
      ok: true,
      applies_policy_override: false,
    } as never);

    const rpc = vi.fn().mockResolvedValue({ data: "m1", error: null });
    const supabase = { rpc } as never;

    const r = await completeEscalationResolutionAtomic(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      learningOutcome: "one_off_case",
      reasonCode: "x",
      actionKey: "send_message",
      decisionJustification: {},
      weddingId: "w1",
      questionBody: "q",
      resolutionSummary: "ok",
      photographerReplyRaw: "plain text",
      clientThreadId: null,
    });

    expect(r.branch).toBe("memory");
    expect(rpc).toHaveBeenCalledWith("complete_escalation_resolution_memory", expect.any(Object));
    const memArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(memArgs.p_outcome).toBe("ok");
    expect(memArgs.p_summary).toBe("ok");
  });

  it("memory path: passes first line as p_outcome when resolution is multi-line", async () => {
    vi.mocked(extractAuthorizedCaseExceptionPayloadFromOperatorText).mockResolvedValue({
      ok: true,
      applies_policy_override: false,
    } as never);

    const rpc = vi.fn().mockResolvedValue({ data: "m1", error: null });
    const supabase = { rpc } as never;

    await completeEscalationResolutionAtomic(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      learningOutcome: "one_off_case",
      reasonCode: "x",
      actionKey: "send_message",
      decisionJustification: {},
      weddingId: "w1",
      questionBody: "q",
      resolutionSummary: "Approved fee waiver.\nDetails in thread.",
      photographerReplyRaw: "plain text",
      clientThreadId: null,
    });

    const memArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(memArgs.p_outcome).toBe("Approved fee waiver.");
    expect(memArgs.p_summary).toBe("Approved fee waiver.\nDetails in thread.".trim().slice(0, 400));
  });

  it("simulated RPC failure does not apply a separate finalize (single RPC boundary)", async () => {
    vi.mocked(extractAuthorizedCaseExceptionPayloadFromOperatorText).mockResolvedValue({
      ok: true,
      applies_policy_override: false,
    } as never);

    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "finalize failed (concurrent update?)" },
    });
    const supabase = { rpc } as never;

    await expect(
      completeEscalationResolutionAtomic(supabase, {
        photographerId: "p1",
        escalationId: "e1",
        learningOutcome: "one_off_case",
        reasonCode: "x",
        actionKey: "send_message",
        decisionJustification: {},
        weddingId: "w1",
        questionBody: "q",
        resolutionSummary: "ok",
        photographerReplyRaw: "plain",
        clientThreadId: null,
      }),
    ).rejects.toThrow(/complete_escalation_resolution_memory/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("idempotent retry: same branch calls same RPC again (DB layer converges)", async () => {
    vi.mocked(extractAuthorizedCaseExceptionPayloadFromOperatorText).mockResolvedValue({
      ok: true,
      applies_policy_override: true,
      override_payload: { decision_mode: "auto" },
      effective_until_iso: null,
    } as never);

    const upsertMod = await import("./policy/upsertAuthorizedCaseExceptionFromEscalationResolution.ts");
    vi.spyOn(upsertMod, "fetchPlaybookRuleIdForTenantActionKey").mockResolvedValue("rule-1");

    const rpc = vi.fn().mockResolvedValue({ data: "exc-1", error: null });
    const supabase = { rpc } as never;

    const params = {
      photographerId: "p1",
      escalationId: "e1",
      learningOutcome: "one_off_case" as const,
      reasonCode: "x",
      actionKey: "send_message",
      decisionJustification: {},
      weddingId: "w1",
      questionBody: "q",
      resolutionSummary: "ok",
      photographerReplyRaw: "yes",
      clientThreadId: null,
    };

    await completeEscalationResolutionAtomic(supabase, params);
    await completeEscalationResolutionAtomic(supabase, params);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.every((c) => c[0] === "complete_escalation_resolution_authorized_case_exception"))
      .toBe(true);
  });
});
