import { describe, expect, it } from "vitest";
import {
  isValidUuidString,
  parseReviewPlaybookRuleCandidateHttpBody,
  validateReviewPlaybookRuleCandidateUuids,
} from "./reviewPlaybookRuleCandidateRpc.ts";

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_UUID_2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("isValidUuidString", () => {
  it("accepts canonical lowercase UUID", () => {
    expect(isValidUuidString(SAMPLE_UUID)).toBe(true);
  });

  it("accepts uppercase UUID", () => {
    expect(isValidUuidString("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(isValidUuidString("not-a-uuid")).toBe(false);
    expect(isValidUuidString("c1")).toBe(false);
    expect(isValidUuidString("")).toBe(false);
  });
});

describe("validateReviewPlaybookRuleCandidateUuids", () => {
  it("rejects malformed candidate_id", () => {
    const r = validateReviewPlaybookRuleCandidateUuids({
      candidate_id: "not-a-uuid",
      action: "approve",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("narrow");
    expect(r.error).toContain("candidate_id");
  });

  it("rejects malformed superseded_by_candidate_id when provided", () => {
    const r = validateReviewPlaybookRuleCandidateUuids({
      candidate_id: SAMPLE_UUID,
      action: "supersede",
      superseded_by_candidate_id: "bad-id",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("narrow");
    expect(r.error).toContain("superseded_by_candidate_id");
  });

  it("accepts valid candidate and supersede target", () => {
    const r = validateReviewPlaybookRuleCandidateUuids({
      candidate_id: SAMPLE_UUID,
      action: "supersede",
      superseded_by_candidate_id: SAMPLE_UUID_2,
    });
    expect(r).toEqual({ ok: true });
  });
});

describe("parseReviewPlaybookRuleCandidateHttpBody", () => {
  it("parses minimal approve body with UUID candidate_id", () => {
    const b = parseReviewPlaybookRuleCandidateHttpBody({
      candidate_id: SAMPLE_UUID,
      action: "approve",
    });
    expect(b).not.toBeNull();
    expect(b?.candidate_id).toBe(SAMPLE_UUID);
  });
});
