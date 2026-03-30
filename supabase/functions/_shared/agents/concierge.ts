/**
 * Concierge Agent — answers booked-client questions using project history.
 * Uses Google Gemini 1.5 Pro with JSON mode for structured factual output.
 *
 * Set GEMINI_API_KEY in Supabase Edge Function secrets.
 */
import { GoogleGenAI } from "npm:@google/genai";

export type ConciergeResult = {
  reply_bullets: string[];
};

const SYSTEM_PROMPT = `You are the Concierge Agent. Read the client's message and the project history.
Output a strict JSON object with a single key: reply_bullets (an array of 2-3 brief, factual strings answering the client's question based strictly on the provided timeline and data. Do not invent facts or write a full email).

Output ONLY the JSON object. No markdown fences, no explanation.`;

export async function runConciergeAgent(
  rawMessage: string,
  weddingData: Record<string, unknown>,
  threadMessages: Record<string, unknown>[],
): Promise<ConciergeResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const ai = new GoogleGenAI({ apiKey });

  const historyBlock = threadMessages
    .map((m) => `[${m.direction}] ${m.sender}: ${m.body}`)
    .join("\n");

  const userContent = [
    "## Wedding Project Data",
    `Couple: ${weddingData.couple_names}`,
    `Date: ${weddingData.wedding_date ?? "not confirmed"}`,
    `Location: ${weddingData.location ?? "not confirmed"}`,
    `Stage: ${weddingData.stage ?? "unknown"}`,
    weddingData.story_notes ? `Notes: ${weddingData.story_notes}` : "",
    "",
    "## Recent Thread History",
    historyBlock || "(no prior messages)",
    "",
    "## Client's New Message",
    rawMessage,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-1.5-pro",
    contents: userContent,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  });

  const text = response.text ?? "";

  try {
    const parsed = JSON.parse(text) as ConciergeResult;

    if (!Array.isArray(parsed.reply_bullets) || parsed.reply_bullets.length === 0) {
      throw new Error("Missing reply_bullets");
    }

    return { reply_bullets: parsed.reply_bullets.slice(0, 3) };
  } catch (e) {
    throw new Error(`Concierge agent returned invalid JSON: ${text.slice(0, 200)} — ${e}`);
  }
}
