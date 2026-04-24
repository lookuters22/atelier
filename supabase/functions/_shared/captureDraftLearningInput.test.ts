import { afterEach, describe, expect, it, vi } from "vitest";
import * as patternReviewGate from "./patternReviewGate.ts";
import { captureDraftLearningInput } from "./captureDraftLearningInput.ts";

describe("captureDraftLearningInput", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts approval_edit memory with explicit project scope when weddingId is set", async () => {
    vi.spyOn(patternReviewGate, "maybeRecordPatternMapReview").mockResolvedValue();
    const payloads: unknown[] = [];
    const supabase = {
      from: vi.fn(() => ({
        insert: (p: unknown) => {
          payloads.push(p);
          return Promise.resolve({ error: null });
        },
      })),
    } as never;

    await captureDraftLearningInput(supabase, {
      channel: "approval_edit",
      photographerId: "p1",
      weddingId: "w1",
      draftId: "d1",
      originalBody: "a",
      editedBody: "b",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual(
      expect.objectContaining({
        photographer_id: "p1",
        wedding_id: "w1",
        scope: "project",
        type: "draft_approval_edit_learning",
      }),
    );
    const fc = String((payloads[0] as { full_content?: string }).full_content ?? "");
    expect(fc).toContain("pattern_fp:");
    expect(fc).toContain("draft_id: d1");
    expect(fc).toContain("edit_signal:");
    expect(fc).toContain("middle_excerpt_");
    expect(fc).not.toContain("original_body:");
    expect(fc).not.toContain("edited_body:");
  });

  it("inserts approval_edit memory with explicit studio scope when weddingId is null", async () => {
    vi.spyOn(patternReviewGate, "maybeRecordPatternMapReview").mockResolvedValue();
    const payloads: unknown[] = [];
    const supabase = {
      from: vi.fn(() => ({
        insert: (p: unknown) => {
          payloads.push(p);
          return Promise.resolve({ error: null });
        },
      })),
    } as never;

    await captureDraftLearningInput(supabase, {
      channel: "approval_edit",
      photographerId: "p1",
      weddingId: null,
      draftId: "d1",
      originalBody: "a",
      editedBody: "b",
    });

    expect(payloads[0]).toEqual(
      expect.objectContaining({
        wedding_id: null,
        scope: "studio",
      }),
    );
  });

  it("approval_edit full_content does not embed full persona draft bodies (bounded signal only)", async () => {
    vi.spyOn(patternReviewGate, "maybeRecordPatternMapReview").mockResolvedValue();
    const payloads: unknown[] = [];
    const supabase = {
      from: vi.fn(() => ({
        insert: (p: unknown) => {
          payloads.push(p);
          return Promise.resolve({ error: null });
        },
      })),
    } as never;

    const longA = `${"A".repeat(400)}tail-a`;
    const longB = `${"B".repeat(400)}tail-b`;

    await captureDraftLearningInput(supabase, {
      channel: "approval_edit",
      photographerId: "p1",
      weddingId: "w1",
      draftId: "d-long",
      originalBody: longA,
      editedBody: longB,
    });

    const fc = String((payloads[0] as { full_content?: string }).full_content ?? "");
    expect(fc).not.toContain(longA);
    expect(fc).not.toContain(longB);
    expect(fc.length).toBeLessThanOrEqual(2500);
    expect(fc).toMatch(/pattern_fp:[a-f0-9]+/);
    expect(fc).toContain("draft_id: d-long");
  });

  it("inserts rewrite_feedback memory with explicit scope", async () => {
    vi.spyOn(patternReviewGate, "maybeRecordPatternMapReview").mockResolvedValue();
    const payloads: unknown[] = [];
    const supabase = {
      from: vi.fn(() => ({
        insert: (p: unknown) => {
          payloads.push(p);
          return Promise.resolve({ error: null });
        },
      })),
    } as never;

    await captureDraftLearningInput(supabase, {
      channel: "rewrite_feedback",
      photographerId: "p1",
      weddingId: "w2",
      draftId: "d2",
      feedback: "needs warmth",
    });

    expect(payloads[0]).toEqual(
      expect.objectContaining({
        scope: "project",
        wedding_id: "w2",
        type: "draft_rewrite_feedback_learning",
      }),
    );
  });
});
