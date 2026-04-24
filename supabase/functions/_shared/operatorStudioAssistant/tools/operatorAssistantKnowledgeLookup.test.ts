import { describe, expect, it, vi } from "vitest";

vi.mock("../../embeddings/generateTextEmbeddingSmall.ts", () => ({
  generateTextEmbeddingSmall: vi.fn().mockResolvedValue(Array.from({ length: 1536 }, (_, i) => (i % 100) / 10_000)),
}));

import { generateTextEmbeddingSmall } from "../../embeddings/generateTextEmbeddingSmall.ts";
import {
  fetchOperatorKnowledgeLookupRows,
  OPERATOR_KNOWLEDGE_LOOKUP_MAX_ROWS,
} from "./operatorAssistantKnowledgeLookup.ts";

describe("fetchOperatorKnowledgeLookupRows", () => {
  it("calls match_knowledge with tenant photographer id and returns capped rows sorted by similarity", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "b",
          document_type: "brand_voice",
          content: "B-content",
          similarity: 0.5,
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          id: "a",
          document_type: "contract",
          content: "A-content",
          similarity: 0.9,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });
    const supabase = { rpc } as never;
    const out = await fetchOperatorKnowledgeLookupRows(supabase, "photo-1", "payment terms deposit");
    expect(vi.mocked(generateTextEmbeddingSmall)).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "match_knowledge",
      expect.objectContaining({
        p_photographer_id: "photo-1",
        p_document_type: null,
      }),
    );
    expect(out[0]!.id).toBe("a");
    expect(out[0]!.similarity).toBe(0.9);
    expect(out.length).toBeLessThanOrEqual(OPERATOR_KNOWLEDGE_LOOKUP_MAX_ROWS);
  });

  it("returns empty array when query is blank after truncate", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as never;
    const out = await fetchOperatorKnowledgeLookupRows(supabase, "photo-1", "   ");
    expect(out).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
