/**
 * Triage Agent — classifies an inbound message into one of six intents
 * matching the Worker Agent roster.
 * Uses OpenAI gpt-4o-mini for low-latency, low-cost classification.
 *
 * Set OPENAI_API_KEY in Supabase Edge Function secrets.
 */

import { truncateTriageUserMessage } from "../triageA5Budget.ts";

export type TriageIntent =
  | "intake"
  | "commercial"
  | "logistics"
  | "project_management"
  | "concierge"
  | "studio";

const VALID_INTENTS: ReadonlySet<string> = new Set<TriageIntent>([
  "intake",
  "commercial",
  "logistics",
  "project_management",
  "concierge",
  "studio",
]);

const SYSTEM_PROMPT = `You are a strict message classifier for a luxury wedding photography studio.
Classify the user message into exactly one of these categories:
- intake (new inquiries, date availability checks, initial interest)
- commercial (money, pricing, packages, contracts, deposits, invoices, payments)
- logistics (flights, hotels, destination travel planning, transport, accommodation)
- project_management (day-of timelines, vendor coordination, weather contingencies, shot lists)
- concierge (general client Q&A, reassurance, coverage hours, what-to-expect questions)
- studio (post-wedding delivery, gallery timelines, album design, print orders)

Respond with ONLY the single lowercase category string. No punctuation, no explanation.`;

export async function runTriageAgent(messageText: string): Promise<TriageIntent> {
  const inboundTrim = String(messageText ?? "").trim();
  if (!inboundTrim) {
    return "concierge";
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const userForModel = truncateTriageUserMessage(String(messageText ?? ""));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 10,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userForModel },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const json = await res.json() as {
    choices: { message: { content: string } }[];
  };

  const raw = json.choices[0]?.message?.content?.trim().toLowerCase() ?? "";

  if (VALID_INTENTS.has(raw)) {
    return raw as TriageIntent;
  }

  return "concierge";
}
