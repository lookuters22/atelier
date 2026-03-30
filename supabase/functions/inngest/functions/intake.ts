/**
 * Intake Agent — Data Extractor & Researcher for new leads.
 *
 * Listens for ai/intent.intake.
 *
 * 1. Agentic loop extracts structured data from the inquiry and checks
 *    calendar availability via the calendar tool.
 * 2. Creates wedding, client, thread, and message rows in the database.
 * 3. Hands off to the Persona Agent for brand-voice drafting.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  checkCalendarAvailability,
  type CalendarToolParams,
} from "../../_shared/tools/calendar.ts";

const SYSTEM_PROMPT = `You are the Intake Agent. A new inquiry has arrived.

Your job is to extract facts and check availability. Follow these steps strictly:

1. Extract the Couple Names, Date, Location, and Budget from the message.
2. Use your check_calendar_availability tool to check the date.
3. Output a JSON object with these exact keys:
   {
     "couple_names": "string",
     "wedding_date": "ISO date string or null",
     "location": "string or null",
     "budget": "string or null",
     "story_notes": "brief summary of the inquiry",
     "raw_facts": "factual summary including extracted details and calendar availability"
   }

Output ONLY the JSON object. No markdown fences, no explanation.`;

const TOOL_SPEC = {
  type: "function" as const,
  function: {
    name: checkCalendarAvailability.name,
    description: checkCalendarAvailability.description,
    parameters: checkCalendarAvailability.parameters,
  },
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIResponse = {
  choices: {
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
};

async function callOpenAI(messages: ChatMessage[]): Promise<OpenAIResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
      tools: [TOOL_SPEC],
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  return (await res.json()) as OpenAIResponse;
}

type IntakeExtraction = {
  couple_names: string;
  wedding_date: string | null;
  location: string | null;
  budget: string | null;
  story_notes: string;
  raw_facts: string;
};

const MAX_TOOL_ROUNDS = 4;

export const intakeFunction = inngest.createFunction(
  { id: "intake-worker", name: "Intake Agent — Data Extractor & Researcher" },
  { event: "ai/intent.intake" },
  async ({ event, step }) => {
    const {
      photographer_id,
      thread_id: originThreadId,
      raw_message,
      sender_email,
      reply_channel,
    } = event.data;

    // ── Agentic extraction + calendar check ──────────────────────
    const extraction = await step.run("extract-and-research", async () => {
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: raw_message },
      ];

      let finalContent = "";

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await callOpenAI(messages);
        const choice = response.choices[0];
        const assistantMsg = choice.message;

        messages.push({
          role: "assistant",
          content: assistantMsg.content,
          tool_calls: assistantMsg.tool_calls,
        });

        if (choice.finish_reason === "stop" || !assistantMsg.tool_calls?.length) {
          finalContent = (assistantMsg.content ?? "{}").trim();
          break;
        }

        for (const toolCall of assistantMsg.tool_calls) {
          const args = JSON.parse(
            toolCall.function.arguments,
          ) as CalendarToolParams;

          const result = await checkCalendarAvailability.handler(args);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }

      if (!finalContent) {
        const fallback = await callOpenAI(messages);
        finalContent = (fallback.choices[0].message.content ?? "{}").trim();
      }

      const cleaned = finalContent
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();

      const parsed = JSON.parse(cleaned) as Partial<IntakeExtraction>;

      return {
        couple_names: parsed.couple_names ?? "Unknown",
        wedding_date: parsed.wedding_date ?? null,
        location: parsed.location ?? null,
        budget: parsed.budget ?? null,
        story_notes: parsed.story_notes ?? "",
        raw_facts: parsed.raw_facts ?? "",
      } satisfies IntakeExtraction;
    });

    // ── Database mutations ────────────────────────────────────────
    const records = await step.run("create-wedding-records", async () => {
      const { data: wedding, error: weddingErr } = await supabaseAdmin
        .from("weddings")
        .insert({
          photographer_id,
          couple_names: extraction.couple_names,
          wedding_date: extraction.wedding_date ?? new Date().toISOString(),
          location: extraction.location ?? "TBD",
          stage: "inquiry",
          story_notes: extraction.story_notes || null,
        })
        .select("id")
        .single();

      if (weddingErr || !wedding) {
        throw new Error(`Failed to create wedding: ${weddingErr?.message}`);
      }

      const weddingId = wedding.id as string;

      const { error: clientErr } = await supabaseAdmin.from("clients").insert({
        wedding_id: weddingId,
        name: extraction.couple_names,
        role: "Lead",
        email: sender_email,
      });

      if (clientErr) {
        throw new Error(`Failed to create client: ${clientErr.message}`);
      }

      const { data: thread, error: threadErr } = await supabaseAdmin
        .from("threads")
        .insert({
          wedding_id: weddingId,
          title: "Initial Inquiry",
          kind: "group",
        })
        .select("id")
        .single();

      if (threadErr || !thread) {
        throw new Error(`Failed to create thread: ${threadErr?.message}`);
      }

      const threadId = thread.id as string;

      const { error: msgErr } = await supabaseAdmin.from("messages").insert({
        thread_id: threadId,
        direction: "in",
        sender: sender_email,
        body: raw_message,
      });

      if (msgErr) {
        throw new Error(`Failed to log inbound message: ${msgErr.message}`);
      }

      return { weddingId, threadId };
    });

    // ── Link originating thread to the new wedding ──────────────
    if (originThreadId) {
      await step.run("link-originating-thread", async () => {
        const { error: linkErr } = await supabaseAdmin
          .from("threads")
          .update({ wedding_id: records.weddingId })
          .eq("id", originThreadId);

        if (linkErr) {
          console.error(`Failed to link originating thread: ${linkErr.message}`);
        }
      });
    }

    // ── Handoff to Persona Agent ─────────────────────────────────
    await step.sendEvent("handoff-to-persona", {
      name: "ai/intent.persona",
      data: {
        wedding_id: records.weddingId,
        thread_id: records.threadId,
        photographer_id,
        raw_facts: extraction.raw_facts,
        reply_channel: reply_channel ?? undefined,
      },
    });

    return {
      status: "facts_extracted_handoff_sent",
      weddingId: records.weddingId,
      threadId: records.threadId,
      extraction,
    };
  },
);
