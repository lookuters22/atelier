import { describe, expect, it } from "vitest";
import {
  extractUuidCandidatesFromText,
  pickOpenEscalationForOperatorReply,
  type EscalationRowForOperator,
} from "./operatorEscalationMatching.ts";

describe("operatorEscalationMatching", () => {
  it("extractUuidCandidatesFromText dedupes case-insensitively", () => {
    const id = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    expect(extractUuidCandidatesFromText(`See ${id} and ${id.toUpperCase()}`)).toEqual([id]);
  });

  it("extractUuidCandidatesFromText finds multiple distinct ids", () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(extractUuidCandidatesFromText(`first ${a} then ${b}`)).toEqual([a, b]);
  });

  it("pickOpenEscalationForOperatorReply prefers V3 action key on operator thread", () => {
    const op = "op-thread";
    const rows: EscalationRowForOperator[] = [
      {
        id: "1",
        question_body: "q",
        created_at: "2026-01-02T00:00:00Z",
        action_key: "legacy.op",
        wedding_id: null,
        reason_code: "r",
        decision_justification: {},
        thread_id: op,
      },
      {
        id: "2",
        question_body: "q2",
        created_at: "2026-01-01T00:00:00Z",
        action_key: "orchestrator.client.v1.output_auditor.v1",
        wedding_id: null,
        reason_code: "r2",
        decision_justification: {},
        thread_id: op,
      },
    ];
    const picked = pickOpenEscalationForOperatorReply(rows, op);
    expect(picked?.id).toBe("2");
  });

  it("pickOpenEscalationForOperatorReply prefers client thread over older legacy operator-only", () => {
    const op = "op-thread";
    const client = "client-thread";
    const rows: EscalationRowForOperator[] = [
      {
        id: "legacy",
        question_body: "q",
        created_at: "2026-01-03T00:00:00Z",
        action_key: "discount_quote",
        wedding_id: null,
        reason_code: "r",
        decision_justification: {},
        thread_id: op,
      },
      {
        id: "client",
        question_body: "q2",
        created_at: "2026-01-02T00:00:00Z",
        action_key: "other",
        wedding_id: null,
        reason_code: "r2",
        decision_justification: {},
        thread_id: client,
      },
    ];
    const picked = pickOpenEscalationForOperatorReply(rows, op);
    expect(picked?.id).toBe("client");
  });

  it("pickOpenEscalationForOperatorReply falls back to legacy operator-thread row", () => {
    const op = "op-thread";
    const rows: EscalationRowForOperator[] = [
      {
        id: "legacy",
        question_body: "q",
        created_at: "2026-01-01T00:00:00Z",
        action_key: "discount_quote",
        wedding_id: null,
        reason_code: "r",
        decision_justification: {},
        thread_id: op,
      },
    ];
    const picked = pickOpenEscalationForOperatorReply(rows, op);
    expect(picked?.id).toBe("legacy");
  });
});
