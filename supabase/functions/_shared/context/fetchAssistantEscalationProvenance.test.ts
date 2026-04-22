import { describe, expect, it } from "vitest";
import {
  escalationProvenanceToolPayload,
  fetchAssistantEscalationProvenance,
  MAX_DECISION_JUSTIFICATION_JSON_CHARS,
} from "./fetchAssistantEscalationProvenance.ts";

const EID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO = "photo-1";

describe("fetchAssistantEscalationProvenance", () => {
  it("invalid_escalation_id", async () => {
    const supabase = { from: () => ({}) } as never;
    const snap = await fetchAssistantEscalationProvenance(supabase, PHOTO, "x");
    expect(snap.selectionNote).toBe("invalid_escalation_id");
  });

  it("escalation_not_found_or_denied", async () => {
    const supabase = {
      from: (t: string) => {
        if (t !== "escalation_requests") return {} as never;
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
    const snap = await fetchAssistantEscalationProvenance(supabase, PHOTO, EID);
    expect(snap.selectionNote).toBe("escalation_not_found_or_denied");
  });

  it("ok: full row with embeds and justification truncation", async () => {
    const bigJ: Record<string, string> = {};
    for (let i = 0; i < MAX_DECISION_JUSTIFICATION_JSON_CHARS + 50; i++) {
      bigJ[`k${i}`] = "x";
    }
    const supabase = {
      from: (t: string) => {
        if (t !== "escalation_requests") return {} as never;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: EID,
                      created_at: "2026-01-01T00:00:00Z",
                      status: "open",
                      action_key: "send_quote",
                      reason_code: "needs_approval",
                      question_body: "OK to send quote?",
                      decision_justification: bigJ,
                      operator_delivery: "dashboard_only",
                      learning_outcome: null,
                      playbook_rule_id: "pr-1",
                      promote_to_playbook: false,
                      recommended_resolution: "yes",
                      resolution_storage_target: "task",
                      resolution_text: null,
                      resolved_at: null,
                      resolved_decision_mode: null,
                      thread_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      wedding_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                      threads: { title: "Re: Q", kind: "email" },
                      weddings: { couple_names: "A & B", stage: "inquiry", project_type: "wedding" },
                      playbook_rules: {
                        topic: "Pricing",
                        action_key: "send_quote",
                        decision_mode: "ask_first",
                        instruction: "Always confirm package line items.",
                      },
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        } as never;
      },
    } as never;

    const snap = await fetchAssistantEscalationProvenance(supabase, PHOTO, EID);
    expect(snap.selectionNote).toBe("ok");
    expect(snap.actionKey).toBe("send_quote");
    expect(snap.decisionJustificationTruncated).toBe(true);
    expect(snap.playbookRule?.topic).toBe("Pricing");
    const payload = escalationProvenanceToolPayload(snap);
    expect((payload.escalation as { questionBody: string }).questionBody).toContain("OK to send");
  });
});
