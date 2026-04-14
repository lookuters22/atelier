import { describe, expect, it } from "vitest";
import { finalizeEscalationWithWritebackResult } from "./finalizeEscalationWithWritebackResult.ts";

describe("finalizeEscalationWithWritebackResult", () => {
  it("sets answered + storage target for each writeback branch", async () => {
    const updates: unknown[] = [];

    const supabase = {
      from: (table: string) => {
        if (table !== "escalation_requests") throw new Error(`unexpected ${table}`);
        return {
          update: (payload: unknown) => {
            updates.push(payload);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      },
    };

    await finalizeEscalationWithWritebackResult(supabase as never, {
      photographerId: "p1",
      escalationId: "e1",
      learningOutcome: "one_off_case",
      writeback: {
        branch: "authorized_case_exception",
        exceptionId: "x1",
        playbookRuleId: "rule-a",
      },
    });

    expect(updates.length).toBe(1);
    const u = updates[0] as Record<string, unknown>;
    expect(u.status).toBe("answered");
    expect(u.resolution_storage_target).toBe("authorized_case_exceptions");
    expect(u.playbook_rule_id).toBe("rule-a");
    expect(u.promote_to_playbook).toBe(false);
  });
});
