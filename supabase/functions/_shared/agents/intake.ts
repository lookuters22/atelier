/**
 * Intake Agent — extracts structured data from a new wedding inquiry.
 * Uses Google Gemini 1.5 Pro with JSON mode for reliable structured output.
 *
 * Set GEMINI_API_KEY in Supabase Edge Function secrets.
 */
import { GoogleGenAI } from "npm:@google/genai";

export type IntakeExtraction = {
  couple_names: string;
  wedding_date: string | null;
  location: string | null;
  budget: string | null;
  reply_bullets: [string, string, string];
};

const SYSTEM_PROMPT = `You are the Intake Agent for a luxury wedding photography studio.
Read the inquiry below. Extract data into a strict JSON schema:

{
  "couple_names": "string — the couple's names, e.g. 'Sofia & Marco'",
  "wedding_date": "ISO 8601 date string or null if not mentioned",
  "location": "string — venue or city, or null if not mentioned",
  "budget": "string — any mentioned budget or package interest, or null",
  "reply_bullets": ["string", "string", "string"]
}

reply_bullets must be exactly 3 short factual instructions for the reply writer:
1. Confirm what you understood about their request.
2. Note what information is still missing.
3. Suggest the next step (e.g. 'Propose a discovery call').

Output ONLY the JSON object. No markdown fences, no explanation.`;

export async function runIntakeAgent(rawMessage: string): Promise<IntakeExtraction> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-1.5-pro",
    contents: rawMessage,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 512,
    },
  });

  const text = response.text ?? "";

  try {
    const parsed = JSON.parse(text) as IntakeExtraction;

    if (!parsed.couple_names || !Array.isArray(parsed.reply_bullets)) {
      throw new Error("Missing required fields");
    }

    if (parsed.reply_bullets.length < 3) {
      while (parsed.reply_bullets.length < 3) {
        parsed.reply_bullets.push("Follow up with the client for more details.");
      }
    }

    return {
      couple_names: parsed.couple_names,
      wedding_date: parsed.wedding_date ?? null,
      location: parsed.location ?? null,
      budget: parsed.budget ?? null,
      reply_bullets: [
        parsed.reply_bullets[0],
        parsed.reply_bullets[1],
        parsed.reply_bullets[2],
      ],
    };
  } catch (e) {
    throw new Error(`Intake agent returned invalid JSON: ${text.slice(0, 200)} — ${e}`);
  }
}
