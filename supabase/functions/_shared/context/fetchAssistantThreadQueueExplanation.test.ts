import { describe, expect, it } from "vitest";
import {
  fetchAssistantThreadQueueExplanation,
  MAX_WORKFLOW_JSON_CHARS,
  threadQueueExplanationToolPayload,
} from "./fetchAssistantThreadQueueExplanation.ts";

const TID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO = "photo-1";

describe("fetchAssistantThreadQueueExplanation", () => {
  it("invalid_thread_id", async () => {
    const supabase = { from: () => ({}) } as never;
    const snap = await fetchAssistantThreadQueueExplanation(supabase, PHOTO, "nope");
    expect(snap.selectionNote).toBe("invalid_thread_id");
    expect(snap.thread).toBeNull();
  });

  it("thread_not_found_or_denied", async () => {
    const supabase = {
      from: (table: string) => {
        if (table !== "threads") return {} as never;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        } as never;
      },
    } as never;
    const snap = await fetchAssistantThreadQueueExplanation(supabase, PHOTO, TID);
    expect(snap.selectionNote).toBe("thread_not_found_or_denied");
  });

  it("ok: operator_review unlinked + open escalation + pending draft + workflow", async () => {
    const meta = { sender_role: "vendor_solicitation", routing_disposition: "x" };
    const bigWf = { z: "y".repeat(MAX_WORKFLOW_JSON_CHARS + 100) };
    const supabase = {
      from: (table: string) => {
        if (table === "threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        id: TID,
                        title: "Pitch",
                        kind: "email",
                        channel: "email",
                        wedding_id: null,
                        needs_human: true,
                        automation_mode: "auto",
                        v3_operator_automation_hold: false,
                        v3_operator_hold_escalation_id: null,
                        ai_routing_metadata: meta,
                        last_activity_at: "2026-01-01T00:00:00Z",
                        status: "open",
                      },
                      error: null,
                    }),
                }),
              }),
            }),
          } as never;
        }
        if (table === "escalation_requests") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: "e1",
                              created_at: "2026-01-02T00:00:00Z",
                              action_key: "ak",
                              reason_code: "rc",
                              question_body: "Approve pricing?",
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                }),
              }),
            }),
          } as never;
        }
        if (table === "drafts") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () =>
                        Promise.resolve({
                          data: [
                            {
                              id: "d1",
                              created_at: "2026-01-03T00:00:00Z",
                              status: "pending_approval",
                              source_action_key: "reply",
                            },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                }),
              }),
            }),
          } as never;
        }
        if (table === "v3_thread_workflow_state") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { next_due_at: null, updated_at: "2026-01-01T01:00:00Z", workflow: bigWf },
                      error: null,
                    }),
                }),
              }),
            }),
          } as never;
        }
        return {} as never;
      },
    } as never;

    const snap = await fetchAssistantThreadQueueExplanation(supabase, PHOTO, TID);
    expect(snap.selectionNote).toBe("ok");
    expect(snap.thread?.derivedInboxBucket).toBe("operator_review");
    expect(snap.openEscalations).toHaveLength(1);
    expect(snap.pendingApprovalDrafts).toHaveLength(1);
    expect(snap.v3ThreadWorkflow?.workflowTruncated).toBe(true);
    expect(snap.zenTabHints.review.likely).toBe(true);
    expect(snap.zenTabHints.drafts.likely).toBe(true);
    expect(snap.informationalNotes.some((n) => n.includes("needs_human"))).toBe(true);
    const payload = threadQueueExplanationToolPayload(snap);
    expect(String(payload.semanticsNote)).toMatch(/Review.*Zen tab/i);
  });
});
