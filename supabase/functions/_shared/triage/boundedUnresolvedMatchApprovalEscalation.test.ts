import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

vi.mock("../inngest.ts", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT: "operator/escalation.pending_delivery.v1",
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION: 1,
}));

import { insertBoundedUnresolvedMatchApprovalEscalation } from "./boundedUnresolvedMatchApprovalEscalation.ts";

describe("insertBoundedUnresolvedMatchApprovalEscalation", () => {
  it("sets v3 operator automation hold on the client thread after escalation insert", async () => {
    const threadUpdates: unknown[] = [];

    const supabase = {
      from: (table: string) => {
        if (table === "escalation_requests") {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "esc-near-match-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "threads") {
          return {
            update: (row: Record<string, unknown>) => {
              threadUpdates.push(row);
              return {
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const id = await insertBoundedUnresolvedMatchApprovalEscalation(supabase, {
      photographerId: "photo-1",
      threadId: "thread-client-email",
      candidateWeddingId: "wedding-cand-uuid",
      confidenceScore: 82,
      matchmakerReasoning: "reason",
      llmIntent: "inquiry",
      senderEmail: "a@b.com",
    });

    expect(id).toBe("esc-near-match-1");
    expect(threadUpdates).toEqual([
      {
        v3_operator_automation_hold: true,
        v3_operator_hold_escalation_id: "esc-near-match-1",
      },
    ]);
  });
});
