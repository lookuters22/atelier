/**
 * RAG Tool — Semantic search over the photographer's knowledge base.
 *
 * Embeds a query via OpenAI text-embedding-3-small, then calls the
 * match_knowledge Postgres RPC function (pgvector cosine similarity)
 * to retrieve the most relevant documents.
 *
 * Set OPENAI_API_KEY in Supabase Edge Function secrets.
 */
import { supabaseAdmin } from "../supabase.ts";

// ── Embedding helper ─────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI Embeddings API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    data: { embedding: number[] }[];
  };

  return json.data[0].embedding;
}

// ── AgentKit tool definition ─────────────────────────────────────

export type RagToolParams = {
  query: string;
  photographer_id: string;
  document_type?: string;
};

type KnowledgeMatch = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export const searchPastCommunications = {
  name: "search_past_communications",
  description:
    "Searches the photographer's database for past emails, brand voice guidelines, or contract terms to use as context.",
  parameters: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The semantic search term describing what context is needed.",
      },
      photographer_id: {
        type: "string",
        description: "UUID of the photographer whose knowledge base to search.",
      },
      document_type: {
        type: "string",
        description:
          "Optional filter: 'brand_voice', 'past_email', or 'contract'. Omit to search all types.",
        enum: ["brand_voice", "past_email", "contract"],
      },
    },
    required: ["query", "photographer_id"],
  },

  handler: async (params: RagToolParams): Promise<string> => {
    const { query, photographer_id, document_type } = params;

    const embedding = await generateEmbedding(query);

    const { data, error } = await supabaseAdmin.rpc("match_knowledge", {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 3,
      p_photographer_id: photographer_id,
      p_document_type: document_type ?? null,
    });

    if (error) {
      throw new Error(`match_knowledge RPC error: ${error.message}`);
    }

    const matches = (data ?? []) as KnowledgeMatch[];

    if (matches.length === 0) {
      return "No relevant documents found in the knowledge base for this query.";
    }

    return matches
      .map(
        (m, i) =>
          `[${i + 1}] (${(m.similarity * 100).toFixed(1)}% match)\n${m.content}`,
      )
      .join("\n\n");
  },
};
