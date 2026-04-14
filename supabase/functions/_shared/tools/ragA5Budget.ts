/**
 * A5 — bounded input for `search_past_communications` → OpenAI `text-embedding-3-small`.
 * Hot path: every RAG tool call embeds the model-supplied query string.
 */
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";

/** Keeps embedding cost and tokenizer usage predictable (aligned with other 8k-class caps). */
export const RAG_MAX_EMBEDDING_QUERY_CHARS = 8000;

export function truncateRagEmbeddingQuery(text: string): string {
  return truncateA5ClassifierField(text, RAG_MAX_EMBEDDING_QUERY_CHARS);
}
