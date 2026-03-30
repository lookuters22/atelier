/**
 * Matchmaker Agent — cross-references an inbound message against active weddings.
 * Uses Google Gemini 1.5 Pro with JSON mode.
 *
 * Set GEMINI_API_KEY in Supabase Edge Function secrets.
 */
import { GoogleGenAI } from "npm:@google/genai";

export type MatchmakerResult = {
  suggested_wedding_id: string | null;
  confidence_score: number;
  reasoning: string;
};

const SYSTEM_PROMPT = `You are the Matchmaker Agent. Cross-reference this email with the JSON roster of active weddings.
Output strict JSON: { "suggested_wedding_id": "uuid" | null, "confidence_score": number (0-100), "reasoning": "brief string" }.
Be highly conservative. Only give a score > 90 if dates, unique venues, or rare names match exactly.
Output ONLY the JSON object. No markdown fences, no explanation.`;

export async function runMatchmakerAgent(
  rawMessage: string,
  activeWeddings: Record<string, unknown>[],
): Promise<MatchmakerResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const ai = new GoogleGenAI({ apiKey });

  const rosterBlock = JSON.stringify(
    activeWeddings.map((w) => ({
      id: w.id,
      couple_names: w.couple_names,
      wedding_date: w.wedding_date,
      location: w.location,
      stage: w.stage,
    })),
  );

  const userContent = [
    "## Active Weddings Roster",
    rosterBlock,
    "",
    "## Inbound Message",
    rawMessage,
  ].join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-1.5-pro",
    contents: userContent,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 256,
    },
  });

  const text = response.text ?? "";

  try {
    const parsed = JSON.parse(text) as MatchmakerResult;

    return {
      suggested_wedding_id: parsed.suggested_wedding_id ?? null,
      confidence_score: typeof parsed.confidence_score === "number" ? parsed.confidence_score : 0,
      reasoning: parsed.reasoning ?? "",
    };
  } catch (e) {
    throw new Error(`Matchmaker agent returned invalid JSON: ${text.slice(0, 200)} — ${e}`);
  }
}
