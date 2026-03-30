/**
 * Persona Agent — Brand Voice & Drafting.
 *
 * Listens for ai/intent.persona.
 *
 * Runs an agentic tool-calling loop with Anthropic Claude Sonnet 4:
 * 1. Fetches wedding + photographer context for dynamic prompt interpolation.
 * 2. The LLM is bound to the search_past_communications RAG tool.
 * 3. System prompt enforces European luxury minimalist style.
 * 4. The finished draft is saved to the drafts table for human approval.
 *
 * Each iteration of the loop is wrapped in step.run() for durable execution.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { sendWhatsAppMessage } from "../../_shared/twilio.ts";
import {
  searchPastCommunications,
  type RagToolParams,
} from "../../_shared/tools/rag.ts";

const MODEL = "claude-sonnet-4-20250514";

type PersonaContext = {
  coupleNames: string;
  weddingDate: string;
  location: string;
  stage: string;
  studioName: string;
  managerName: string;
  photographerNames: string;
};

function buildSystemPrompt(ctx: PersonaContext): string {
  const firstName = ctx.coupleNames.split("&")[0]?.trim() || ctx.coupleNames;

  return `You are the Client Manager for a high-end, luxury photography studio. You must write exactly like a busy, professional human studio manager — not like an AI.

BEFORE DRAFTING: Use your search tool twice.
1. Search document_type: 'brand_voice' to learn tone rules.
2. Search document_type: 'past_email' to study real examples.

If searches return empty, follow the constraints below as your default voice.

ZERO FLUFF RULE:
NEVER use poetic or romantic AI language.
BANNED WORDS AND PHRASES: magical, breathtaking, timeless, tapestry, honor, dance, symphony, capture your love story, weave, cherish, unforgettable, dream, fairy tale, enchanting, whimsical, ethereal, bliss, journey together, story of your love.
If you catch yourself using any of these, delete the sentence and rewrite it plainly.

CRITICAL FORMATTING & STRUCTURE RULES:
You MUST format the email with extreme vertical spacing. You MUST insert a double line break (\\n\\n) after almost every single sentence to create distinct, isolated lines.

Follow this exact template structure for NEW INQUIRY responses, including the spacing:

Hi ${firstName},

Thank you for reaching out to us, and congratulations on the beautiful news!

My name is ${ctx.managerName}, and I'm the client manager at ${ctx.studioName}. It's lovely to e-meet you.

I'm happy to say ${ctx.photographerNames} are currently available on ${ctx.weddingDate} to capture your special memories in ${ctx.location}.

We approach every wedding individually, tailoring our offer to match your plans and preferences.

Could you please share a bit more about how you envision your wedding day, including the number of hours or days you'd like captured and any particular style or moments that are most important to you?

Once I learn a bit more, I'll send over our brochure with detailed options and suggest the package that I believe would be the best fit. Looking forward to hearing from you!

Warmly,

${ctx.managerName}

FOR NON-INQUIRY RESPONSES (booked clients, logistics, follow-ups):
- Use the exact same extreme vertical spacing — double line break after every sentence.
- Address the specific question from the raw_facts.
- Keep it under 8 isolated lines total.
- End with "Warmly,\\n\\n${ctx.managerName}"

GROUNDING RULES (HIGHEST PRIORITY):
- You MUST base your response strictly on the factual payload provided in raw_facts.
- Do NOT invent scenarios, project phases, or relationship stages not present in the data.
- Do NOT assume the wedding has happened unless raw_facts explicitly says so.
- Do NOT write post-wedding templates unless raw_facts explicitly mentions delivery or gallery status.
- The current project stage is: "${ctx.stage}". Respect it.

VOICE RULES:
- You are a silent ghostwriter. NEVER break the fourth wall.
- NEVER mention your internal tools, searches, database, or lack of data.
- NEVER apologize for missing context.

OUTPUT:
- Your output MUST be the drafted email body only. No subject line, no preamble, no meta-commentary.
- Every sentence MUST be followed by a double line break. This is non-negotiable.`;
}

// Anthropic tool definition format
const TOOL_SPEC = {
  name: searchPastCommunications.name,
  description: searchPastCommunications.description,
  input_schema: searchPastCommunications.parameters,
};

// ── Anthropic API types ──────────────────────────────────────────

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

type AnthropicResponse = {
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
};

async function callClaude(
  systemPrompt: string,
  messages: AnthropicMessage[],
): Promise<AnthropicResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      system: systemPrompt,
      max_tokens: 2048,
      temperature: 0.4,
      tools: [TOOL_SPEC],
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  return (await res.json()) as AnthropicResponse;
}

function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function extractToolUses(blocks: ContentBlock[]): ToolUseBlock[] {
  return blocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Inngest function ─────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 5;

export const personaFunction = inngest.createFunction(
  { id: "persona-agent", name: "Persona Agent — Brand Voice & Drafting" },
  { event: "ai/intent.persona" },
  async ({ event, step }) => {
    const { wedding_id, thread_id, photographer_id, raw_facts, reply_channel } = event.data;

    // ── Fetch context for dynamic prompt interpolation ────────────
    const ctx = await step.run("fetch-persona-context", async () => {
      let coupleNames = "there";
      let weddingDate = "your date";
      let location = "your destination";
      let stage = "inquiry";
      let studioName = "Atelier Studio";
      let managerName = "The Atelier Team";
      let photographerNames = "our team";

      if (wedding_id) {
        const { data: wedding } = await supabaseAdmin
          .from("weddings")
          .select("couple_names, wedding_date, location, stage")
          .eq("id", wedding_id)
          .single();

        if (wedding) {
          coupleNames = (wedding.couple_names as string) || coupleNames;
          weddingDate = wedding.wedding_date
            ? formatDate(wedding.wedding_date as string)
            : weddingDate;
          location = (wedding.location as string) || location;
          stage = (wedding.stage as string) || stage;
        }
      }

      if (photographer_id) {
        const { data: photographer } = await supabaseAdmin
          .from("photographers")
          .select("email, settings")
          .eq("id", photographer_id)
          .single();

        if (photographer?.settings) {
          const settings = photographer.settings as Record<string, unknown>;
          studioName = (settings.studio_name as string) || studioName;
          managerName = (settings.manager_name as string) || managerName;
          photographerNames = (settings.photographer_names as string) || photographerNames;
        }
      }

      return {
        coupleNames,
        weddingDate,
        location,
        stage,
        studioName,
        managerName,
        photographerNames,
      } satisfies PersonaContext;
    });

    const systemPrompt = buildSystemPrompt(ctx);

    // ── Agentic tool-calling loop ────────────────────────────────
    const draftBody = await step.run("agentic-drafting-loop", async () => {
      const messages: AnthropicMessage[] = [
        {
          role: "user",
          content: [
            `photographer_id: ${photographer_id}`,
            `couple_names: ${ctx.coupleNames}`,
            `wedding_date: ${ctx.weddingDate}`,
            `location: ${ctx.location}`,
            `stage: ${ctx.stage}`,
            "",
            "## Raw Facts",
            raw_facts,
          ].join("\n"),
        },
      ];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await callClaude(systemPrompt, messages);

        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
          return extractText(response.content);
        }

        const toolUses = extractToolUses(response.content);
        if (toolUses.length === 0) {
          return extractText(response.content);
        }

        const toolResults: ToolResultBlock[] = [];

        for (const toolUse of toolUses) {
          const args = toolUse.input as RagToolParams;

          const result = await searchPastCommunications.handler({
            query: args.query,
            photographer_id: args.photographer_id ?? photographer_id,
            document_type: args.document_type,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        messages.push({ role: "user", content: toolResults });
      }

      const fallback = await callClaude(systemPrompt, messages);
      return extractText(fallback.content);
    });

    // ── Save draft for human approval ────────────────────────────
    const draftId = await step.run("save-draft", async () => {
      const { data, error } = await supabaseAdmin
        .from("drafts")
        .insert({
          thread_id,
          status: "pending_approval",
          body: draftBody,
          instruction_history: [
            {
              step: "persona_agent",
              raw_facts,
              model: MODEL,
              context: ctx,
              tool_calls_enabled: true,
            },
          ],
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to insert draft: ${error.message}`);
      return data.id as string;
    });

    // ── Conditional WhatsApp outbound ─────────────────────────────
    let whatsappSid: string | null = null;

    if (reply_channel === "whatsapp") {
      whatsappSid = await step.run("send-whatsapp-reply", async () => {
        // Find the client's phone number from the most recent inbound message on this thread
        const { data: inboundMsg } = await supabaseAdmin
          .from("messages")
          .select("sender")
          .eq("thread_id", thread_id)
          .eq("direction", "in")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const clientNumber = (inboundMsg?.sender as string) ?? null;

        if (!clientNumber) {
          console.warn(`[persona] No inbound sender found for thread ${thread_id}, skipping WhatsApp send`);
          return null;
        }

        console.log(`[persona] Sending WhatsApp reply to ${clientNumber} for thread ${thread_id}`);
        const sid = await sendWhatsAppMessage(clientNumber, draftBody);
        return sid;
      });
    }

    return {
      status: reply_channel === "whatsapp" && whatsappSid
        ? "draft_saved_and_sent_whatsapp"
        : "draft_pending_approval",
      wedding_id,
      thread_id,
      draftId,
      whatsappSid,
    };
  },
);
