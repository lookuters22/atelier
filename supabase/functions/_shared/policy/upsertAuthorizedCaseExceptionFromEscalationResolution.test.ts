import { describe, expect, it } from "vitest";
import { upsertAuthorizedCaseExceptionFromEscalationResolution } from "./upsertAuthorizedCaseExceptionFromEscalationResolution.ts";

describe("upsertAuthorizedCaseExceptionFromEscalationResolution", () => {
  it("calls atomic RPC with scoped args (idempotent slot)", async () => {
    const rpcCalls: unknown[] = [];

    const supabase = {
      rpc: (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        return Promise.resolve({ data: "exc-new", error: null });
      },
    };

    const r = await upsertAuthorizedCaseExceptionFromEscalationResolution(
      supabase as never,
      {
        photographerId: "p1",
        weddingId: "w1",
        clientThreadId: null,
        escalationId: "esc1",
        overridesActionKey: "send_message",
        targetPlaybookRuleId: "rule-1",
        overridePayload: { decision_mode: "auto" },
        effectiveUntilIso: null,
        notes: "ok",
      },
    );

    expect(rpcCalls.length).toBe(1);
    expect((rpcCalls[0] as { name: string }).name).toBe(
      "replace_authorized_case_exception_for_escalation",
    );
    const args = (rpcCalls[0] as { args: Record<string, unknown> }).args;
    expect(args.p_photographer_id).toBe("p1");
    expect(args.p_wedding_id).toBe("w1");
    expect(args.p_thread_id).toBeNull();
    expect(args.p_escalation_id).toBe("esc1");
    expect(args.p_overrides_action_key).toBe("send_message");
    expect(args.p_target_playbook_rule_id).toBe("rule-1");
    expect(r.id).toBe("exc-new");
  });

  it("surfaces RPC errors (no partial revoke without insert at DB layer)", async () => {
    const supabase = {
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { message: "insert violates check" },
        }),
    };

    await expect(
      upsertAuthorizedCaseExceptionFromEscalationResolution(supabase as never, {
        photographerId: "p1",
        weddingId: "w1",
        clientThreadId: null,
        escalationId: "esc1",
        overridesActionKey: "send_message",
        targetPlaybookRuleId: null,
        overridePayload: { decision_mode: "auto" },
        effectiveUntilIso: null,
        notes: null,
      }),
    ).rejects.toThrow(/insert violates check/);
  });
});
