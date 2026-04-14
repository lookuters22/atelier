import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "../a5MiniClassifierBudget.ts";
import {
  RAG_MAX_EMBEDDING_QUERY_CHARS,
  truncateRagEmbeddingQuery,
} from "./ragA5Budget.ts";

describe("ragA5Budget", () => {
  it("caps embedding query text", () => {
    const long = "q".repeat(RAG_MAX_EMBEDDING_QUERY_CHARS + 50);
    const out = truncateRagEmbeddingQuery(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
