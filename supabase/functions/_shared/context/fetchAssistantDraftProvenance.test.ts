import { describe, expect, it } from "vitest";
import {
  draftProvenanceToolPayload,
  fetchAssistantDraftProvenance,
  MAX_DRAFT_BODY_PREVIEW_CHARS,
  MAX_INSTRUCTION_HISTORY_JSON_CHARS,
} from "./fetchAssistantDraftProvenance.ts";

const DRAFT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO = "photo-1";

function supabaseMockDrafts(
  data: object | null,
  error: { message: string } | null = null,
) {
  return {
    from: (table: string) => {
      if (table !== "drafts") return {} as never;
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data, error }),
            }),
          }),
        }),
      } as never;
    },
  } as never;
}

describe("fetchAssistantDraftProvenance", () => {
  it("invalid_draft_id without calling pattern details", async () => {
    const supabase = { from: () => ({}) } as never;
    const snap = await fetchAssistantDraftProvenance(supabase, PHOTO, "not-a-uuid");
    expect(snap.selectionNote).toBe("invalid_draft_id");
    expect(snap.draftId).toBeNull();
  });

  it("draft_not_found_or_denied when no row for tenant", async () => {
    const supabase = supabaseMockDrafts(null, null);
    const snap = await fetchAssistantDraftProvenance(supabase, PHOTO, DRAFT_ID);
    expect(snap.selectionNote).toBe("draft_not_found_or_denied");
    expect(snap.draftId).toBe(DRAFT_ID);
  });

  it("ok: maps row + thread + instruction_history step count for array", async () => {
    const supabase = supabaseMockDrafts({
      id: DRAFT_ID,
      thread_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "pending_approval",
      created_at: "2026-01-01T12:00:00Z",
      decision_mode: "auto",
      source_action_key: "reply_inquiry",
      body: "Hi — thanks for reaching out.",
      instruction_history: [{ step: "orchestrator", k: "v" }, { step: "persona" }],
      threads: { title: "Re: date", wedding_id: "wwwwwwww-wwww-4www-8www-wwwwwwwwwwww", kind: "email" },
    });
    const snap = await fetchAssistantDraftProvenance(supabase, PHOTO, DRAFT_ID);
    expect(snap.selectionNote).toBe("ok");
    expect(snap.sourceActionKey).toBe("reply_inquiry");
    expect(snap.bodyPreview).toContain("Hi — thanks");
    expect(snap.instructionHistoryStepCount).toBe(2);
    expect(snap.instructionHistoryJson).toContain("orchestrator");
    const payload = draftProvenanceToolPayload(snap) as { draft: { threadTitle: string } };
    expect(payload.draft.threadTitle).toBe("Re: date");
  });

  it("clips long body and long instruction_history JSON", async () => {
    const longBody = "b".repeat(MAX_DRAFT_BODY_PREVIEW_CHARS + 100);
    const bigHistory = { x: "y".repeat(MAX_INSTRUCTION_HISTORY_JSON_CHARS + 500) };
    const supabase = supabaseMockDrafts({
      id: DRAFT_ID,
      thread_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "pending_approval",
      created_at: "2026-01-01T12:00:00Z",
      decision_mode: null,
      source_action_key: null,
      body: longBody,
      instruction_history: bigHistory,
      threads: { title: "T", wedding_id: null, kind: "email" },
    });
    const snap = await fetchAssistantDraftProvenance(supabase, PHOTO, DRAFT_ID);
    expect(snap.bodyPreviewClipped).toBe(true);
    expect(snap.bodyPreview?.length).toBe(MAX_DRAFT_BODY_PREVIEW_CHARS);
    expect(snap.instructionHistoryTruncated).toBe(true);
    expect(snap.instructionHistoryJson?.length).toBeLessThanOrEqual(
      MAX_INSTRUCTION_HISTORY_JSON_CHARS + 2,
    );
  });
});
