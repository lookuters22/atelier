/**
 * Deterministic case-memory id selection — no DB; tenant hydration is enforced in fetchSelectedMemoriesFull.
 */
import { describe, expect, it } from "vitest";
import type { MemoryHeader } from "./fetchMemoryHeaders.ts";
import {
  MAX_SELECTED_MEMORIES,
  selectRelevantMemoryIdsDeterministic,
} from "./selectRelevantMemoriesForDecisionContext.ts";

function h(partial: Partial<MemoryHeader> & Pick<MemoryHeader, "id">): MemoryHeader {
  return {
    wedding_id: null,
    type: "note",
    title: "",
    summary: "",
    ...partial,
  };
}

describe("selectRelevantMemoryIdsDeterministic", () => {
  const baseIn = {
    photographerId: "photo-1",
    threadId: "thread-1",
    rawMessage: "Hello",
    threadSummary: null as string | null,
  };

  it("prefers wedding-scoped rows over tenant-wide when weddingId is set", () => {
    const weddingId = "w-a";
    const headers: MemoryHeader[] = [
      h({
        id: "tenant-wide",
        wedding_id: null,
        title: "Venue policy",
        summary: "matches keyword venue everywhere",
      }),
      h({
        id: "wedding-scoped",
        wedding_id: weddingId,
        title: "Our venue",
        summary: "same keyword venue for overlap",
      }),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId,
      rawMessage: "venue question about the day",
      memoryHeaders: headers,
    });
    expect(ids[0]).toBe("wedding-scoped");
    expect(ids).toContain("tenant-wide");
  });

  it("does not promote headers that are not in the input list (no cross-tenant injection)", () => {
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: "w",
      rawMessage: "x",
      memoryHeaders: [h({ id: "only-one", wedding_id: "w", title: "a", summary: "b" })],
    });
    expect(ids).toEqual(["only-one"]);
    expect(ids).not.toContain("foreign-id");
  });

  it("caps at MAX_SELECTED_MEMORIES", () => {
    const headers: MemoryHeader[] = Array.from({ length: 8 }, (_, i) =>
      h({
        id: `m-${i}`,
        wedding_id: "w",
        title: `t${i}`,
        summary: `venue ${i}`,
      }),
    );
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: "w",
      rawMessage: "venue",
      memoryHeaders: headers,
    });
    expect(ids.length).toBe(MAX_SELECTED_MEMORIES);
  });

  it("stable ordering: same input yields same ids", () => {
    const headers: MemoryHeader[] = [
      h({ id: "b", wedding_id: "w", title: "x", summary: "y" }),
      h({ id: "a", wedding_id: "w", title: "x", summary: "y" }),
    ];
    const input = { ...baseIn, weddingId: "w", rawMessage: "nomatch", memoryHeaders: headers };
    expect(selectRelevantMemoryIdsDeterministic(input)).toEqual(selectRelevantMemoryIdsDeterministic(input));
  });

  it("ranks provisional strong substring above weak exception word when scope equal", () => {
    const headers: MemoryHeader[] = [
      h({
        id: "weak-exception",
        wedding_id: null,
        type: "note",
        title: "Something with exception in body",
        summary: "no strong cue",
      }),
      h({
        id: "strong-cue",
        wedding_id: null,
        type: "v3_verify_case_note",
        title: "QA",
        summary: "fixture",
      }),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: null,
      rawMessage: "unrelated text",
      memoryHeaders: headers,
    });
    expect(ids[0]).toBe("strong-cue");
  });
});
