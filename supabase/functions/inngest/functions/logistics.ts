/**
 * Logistics Agent — Travel Cost Researcher.
 *
 * Listens for ai/intent.logistics.
 *
 * 1. Fetch wedding context to resolve photographer_id and thread_id.
 * 2. Agentic loop estimates travel costs via the travel tool.
 * 3. Slice 3: does not persist to `weddings.story_notes` — bounded CRM/tool path should own that.
 * 4. Hands off raw_facts to the Persona Agent for brand-voice drafting.
 */
import { inngest } from "../../_shared/inngest.ts";
import {
  truncateLogisticsAssistantContent,
  truncateLogisticsClientMessage,
  truncateLogisticsLocation,
  truncateLogisticsToolOutput,
} from "../../_shared/logisticsA5Budget.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  isWeddingAutomationPaused,
  logAutomationPauseObservation,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "../../_shared/weddingAutomationPause.ts";
import {
  estimateTravelCosts,
  type TravelToolParams,
} from "../../_shared/tools/travel.ts";

const TOOL_SPEC = {
  type: "function" as const,
  function: {
    name: estimateTravelCosts.name,
    description: estimateTravelCosts.description,
    parameters: estimateTravelCosts.parameters,
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
      max_tokens: 512,
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

const MAX_TOOL_ROUNDS = 4;

export const logisticsFunction = inngest.createFunction(
  { id: "logistics-worker", name: "Logistics Agent — Travel Cost Researcher" },
  { event: "ai/intent.logistics" },
  async ({ event, step }) => {
    const { wedding_id, raw_message, reply_channel, photographer_id } = event.data;

    if (!photographer_id || typeof photographer_id !== "string") {
      throw new Error("ai/intent.logistics: missing photographer_id (tenant-proof required)");
    }

    // ── Fetch wedding context ────────────────────────────────────
    const context = await step.run("fetch-wedding-context", async () => {
      const { data: wedding, error: weddingErr } = await supabaseAdmin
        .from("weddings")
        .select("id, photographer_id, location, compassion_pause, strategic_pause")
        .eq("id", wedding_id)
        .eq("photographer_id", photographer_id)
        .single();

      if (weddingErr || !wedding) {
        throw new Error(`Wedding not found: ${weddingErr?.message ?? wedding_id}`);
      }

      if (isWeddingAutomationPaused(wedding)) {
        return {
          photographerId: wedding.photographer_id as string,
          location: wedding.location as string,
          threadId: null as string | null,
          automationPaused: true as const,
        };
      }

      const { data: threads } = await supabaseAdmin
        .from("threads")
        .select("id")
        .eq("wedding_id", wedding_id)
        .eq("photographer_id", wedding.photographer_id as string)
        .order("last_activity_at", { ascending: false })
        .limit(1);

      const threadId = (threads?.[0]?.id as string) ?? null;
      if (!threadId) {
        throw new Error(`No thread found for wedding ${wedding_id}`);
      }

      return {
        photographerId: wedding.photographer_id as string,
        location: wedding.location as string,
        threadId,
        automationPaused: false as const,
      };
    });

    if (context.automationPaused) {
      logAutomationPauseObservation({
        observation_type: "inngest_worker_skipped",
        skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
        inngest_function_id: "logistics-worker",
        wedding_id,
        photographer_id,
      });
      return {
        status: "skipped_wedding_automation_paused" as const,
        skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
        wedding_id,
      };
    }

    // ── Agentic travel cost research ─────────────────────────────
    const rawFacts = await step.run("research-travel-costs", async () => {
      const inboundTrim = String(raw_message ?? "").trim();
      if (!inboundTrim) {
        return "";
      }

      const locationForModel = truncateLogisticsLocation(String(context.location ?? ""));
      const clientMessageForModel = truncateLogisticsClientMessage(String(raw_message ?? ""));

      const systemPrompt =
        `You are the Logistics Agent. A client is inquiring about a wedding in ${locationForModel}. ` +
        `Use your estimate_travel_costs tool to get the estimated travel costs. ` +
        `Output ONLY a dry, factual summary string (e.g., "Client wants to book in Lake Como. ` +
        `Travel costs are estimated at $1,500. Add this to the base package.").`;

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: clientMessageForModel },
      ];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await callOpenAI(messages);
        const choice = response.choices[0];
        const assistantMsg = choice.message;

        messages.push({
          role: "assistant",
          content: truncateLogisticsAssistantContent(assistantMsg.content ?? null),
          tool_calls: assistantMsg.tool_calls,
        });

        if (choice.finish_reason === "stop" || !assistantMsg.tool_calls?.length) {
          const final =
            typeof assistantMsg.content === "string"
              ? truncateLogisticsAssistantContent(assistantMsg.content) ?? ""
              : "";
          return final.trim();
        }

        for (const toolCall of assistantMsg.tool_calls) {
          const args = JSON.parse(
            toolCall.function.arguments,
          ) as TravelToolParams;

          const result = await estimateTravelCosts.handler(args);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: truncateLogisticsToolOutput(result),
          });
        }
      }

      const fallback = await callOpenAI(messages);
      const fb = fallback.choices[0].message.content;
      const finalFb = typeof fb === "string" ? truncateLogisticsAssistantContent(fb) ?? "" : "";
      return finalFb.trim();
    });

    // ── Handoff to Persona Agent ─────────────────────────────────
    await step.sendEvent("handoff-to-persona", {
      name: "ai/intent.persona",
      data: {
        wedding_id,
        thread_id: context.threadId,
        photographer_id: context.photographerId,
        raw_facts: rawFacts,
        reply_channel: reply_channel ?? undefined,
      },
    });

    return {
      status: "facts_gathered_handoff_sent",
      wedding_id,
      location: context.location,
      rawFacts,
    };
  },
);
