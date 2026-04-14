/**
 * OpenAI `text-embedding-3-small` — shared by RAG tool and decision-context global KB retrieval.
 */
import { truncateRagEmbeddingQuery } from "../tools/ragA5Budget.ts";

export async function generateTextEmbeddingSmall(text: string): Promise<number[]> {
  const bounded = truncateRagEmbeddingQuery(text);
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
      input: bounded,
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
