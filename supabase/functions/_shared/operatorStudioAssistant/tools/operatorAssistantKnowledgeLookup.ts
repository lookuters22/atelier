/**
 * Bounded semantic `knowledge_base` retrieval for `operator_lookup_knowledge` (domain-first Slice 7).
 * Tenant-scoped via `match_knowledge` only — same RPC as first-pass global knowledge.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { generateTextEmbeddingSmall } from "../../embeddings/generateTextEmbeddingSmall.ts";
import { truncateRagEmbeddingQuery } from "../../tools/ragA5Budget.ts";

/** Max rows returned in tool JSON. */
export const OPERATOR_KNOWLEDGE_LOOKUP_MAX_ROWS = 6;

const OPERATOR_KNOWLEDGE_LOOKUP_MATCH_COUNT = 16;

/** Align with {@link fetchRelevantGlobalKnowledgeForDecisionContext} turn-blob tuning. */
const OPERATOR_KNOWLEDGE_LOOKUP_THRESHOLD = 0.35;

type KbMatchRow = {
  id: string;
  document_type: string;
  content: string;
  similarity: number;
  created_at?: string | null;
};

export type OperatorKnowledgeLookupRow = {
  id: string;
  document_type: string;
  content: string;
  similarity: number;
};

/**
 * Semantic search over tenant `knowledge_base` (pgvector). Rows without embeddings are invisible to RPC.
 */
export async function fetchOperatorKnowledgeLookupRows(
  supabase: SupabaseClient,
  photographerId: string,
  query: string,
): Promise<OperatorKnowledgeLookupRow[]> {
  const q = truncateRagEmbeddingQuery(query);
  if (!q.trim()) {
    return [];
  }

  let embedding: number[];
  try {
    embedding = await generateTextEmbeddingSmall(q);
  } catch (e) {
    console.warn(
      JSON.stringify({
        type: "operator_knowledge_lookup_embed_skipped",
        reason: e instanceof Error ? e.message : String(e),
      }),
    );
    return [];
  }

  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_threshold: OPERATOR_KNOWLEDGE_LOOKUP_THRESHOLD,
    match_count: OPERATOR_KNOWLEDGE_LOOKUP_MATCH_COUNT,
    p_photographer_id: photographerId,
    p_document_type: null,
  });

  if (error) {
    throw new Error(`fetchOperatorKnowledgeLookupRows: ${error.message}`);
  }

  const rows = (data ?? []) as KbMatchRow[];
  if (rows.length === 0) {
    return [];
  }

  const scored = rows.map((row) => ({
    row,
    similarity: Number(row.similarity),
  }));

  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    const ca = a.row.created_at ?? "";
    const cb = b.row.created_at ?? "";
    if (ca !== cb) return cb.localeCompare(ca);
    return String(a.row.id).localeCompare(String(b.row.id));
  });

  return scored.slice(0, OPERATOR_KNOWLEDGE_LOOKUP_MAX_ROWS).map(({ row, similarity }) => ({
    id: row.id,
    document_type: row.document_type,
    content: row.content,
    similarity,
  }));
}
