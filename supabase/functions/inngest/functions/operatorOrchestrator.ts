/**
 * Operator WhatsApp orchestrator (execute_v3 Phase 8 Step 8C).
 *
 * Replaces the broad internal-concierge *model* for the operator lane: `operator/whatsapp.inbound.v1`.
 * Legacy `ai/intent.internal_concierge` remains registered for strangler compatibility (Phase 0D).
 *
 * Narrow capabilities:
 * - Slash commands (/help, /pending)
 * - Answers from verified DB tools only
 * - Short blocked-action questions via `record_operator_escalation` → `escalation_requests`
 * - Resolves photographer replies into open `escalation_requests`
 * - Optional context notes → `memories` (operator_whatsapp_note)
 * - Step 8E: `delivery_policy` on escalations → triage worker (urgent WhatsApp vs batch vs dashboard-only);
 *   orchestrator skips duplicate WhatsApp when an escalation row is created.
 * - Step 9A–9B: `resolveOperatorEscalationResolution` — learning-loop classifier + Zod + atomic RPC by default;
 *   sensitive/compliance escalations still use legacy `completeEscalationResolutionAtomic` → `documents` audit RPC;
 *   V3 operator hold is cleared inside the resolver (single ownership — not duplicated here).
 * - Step 9E: resolution text is written only in the writeback primary store — not duplicated on `escalation_requests` before writeback.
 * - Step 10D: deduped `Awaiting reply:` tasks via `create_awaiting_reply_task`; inbound disposition (answered/deferral/unresolved) when no open escalation.
 */
import { classifyAwaitingReplyDisposition } from "../../_shared/classifyAwaitingReplyDisposition.ts";
import {
  truncateOperatorOrchestratorChatMessage,
  truncateOperatorOrchestratorEscalationQuestion,
  truncateOperatorOrchestratorEscalationReply,
  truncateOperatorOrchestratorToolOutput,
} from "../../_shared/operatorOrchestratorA5Budget.ts";
import {
  applyAwaitingReplyDisposition,
  DEFERRAL_DUE_POLICY_DAYS,
  findEarliestOpenAwaitingReplyTask,
} from "../../_shared/operatorAwaitingReplyTask.ts";
import { classifyOperatorWhatsAppEscalationResolutionBundle } from "../../_shared/learning/classifyOperatorWhatsAppEscalationResolutionBundle.ts";
import { resolveOperatorEscalationResolution } from "../../_shared/learning/resolveOperatorEscalationResolution.ts";
import {
  inngest,
  WHATSAPP_OPERATOR_INBOUND_V1_EVENT,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { sendWhatsAppMessage } from "../../_shared/twilio.ts";
import { fetchOpenEscalationForOperatorInbound } from "../../_shared/operator/operatorEscalationMatching.ts";
import { appendEscalationOperatorTurn } from "../../_shared/operator/threadV3OperatorHold.ts";
import { handleOperatorDataToolCall } from "../../_shared/operatorDataTools.ts";
import {
  createModelInvocationLogger,
  logModelInvocation,
  type ModelInvocationLogFn,
} from "../../_shared/telemetry/modelInvocationLog.ts";

const MODEL = "gpt-4o-mini";
const OPERATOR_THREAD_EXTERNAL_KEY = "operator_whatsapp_inbound";
const OPERATOR_CHANNEL = "whatsapp_operator";
const MEMORY_DEPTH = 8;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_weddings",
      description:
        "Search this studio's weddings by name or location keyword. Returns couple_names, wedding_date, stage, etc. Do not filter by stage when asking about a specific couple's status — search by name and read stage from rows.",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description: "Single keyword: one first name or city. No phrases or status words.",
          },
          stage: {
            type: "string",
            description: "Only to list weddings at a stage (e.g. all booked). Not for one couple's status.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_clients",
      description: "Search clients for this studio by first name or email fragment.",
      parameters: {
        type: "object",
        properties: {
          search_term: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_tasks",
      description: "Open or completed tasks for this studio.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "'open' or 'completed'. Default open." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_pending_drafts",
      description: "Email drafts awaiting approval for this studio.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_open_escalations",
      description: "List open escalation requests (blocked actions / pending decisions).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "record_operator_escalation",
      description:
        "When an action needs the photographer's explicit decision (discount, gift, delay, policy exception, banking). Ask ONE short question in question_body (max ~200 chars). Do not execute the action.",
      parameters: {
        type: "object",
        properties: {
          action_key: { type: "string", description: "e.g. discount_quote, delay_delivery, gift_album" },
          question_body: { type: "string" },
          delivery_policy: {
            type: "string",
            enum: ["urgent_now", "batch_later", "dashboard_only"],
            description:
              "urgent_now = ping WhatsApp now. batch_later = digest (no immediate ping). dashboard_only = inbox UI only.",
          },
          reason_code: { type: "string" },
          why_blocked: { type: "string" },
          missing_fact: { type: "string" },
          risk_class: { type: "string" },
          recommended_next_step: { type: "string" },
          recommended_resolution: { type: "string" },
          wedding_id: { type: "string" },
        },
        required: ["question_body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_awaiting_reply_task",
      description:
        "Create a deduped open task when you need a follow-up answer from the photographer on an important outbound matter. Requires explicit due_date (ISO 8601) from a stated deadline or workflow — never invent relative timings. Dedupes by same action_key + wedding.",
      parameters: {
        type: "object",
        properties: {
          action_key: {
            type: "string",
            description: "Short stable key for this ask (e.g. timeline_confirm, album_proof). Used in title and dedupe.",
          },
          wedding_id: { type: "string" },
          due_date: {
            type: "string",
            description: "Explicit due datetime ISO 8601 (from context or policy). Required.",
          },
        },
        required: ["action_key", "wedding_id", "due_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "capture_operator_context",
      description:
        "Store a durable offline note the photographer stated (e.g. met couple in London, timeline received on WhatsApp). Not for blocked pricing actions — use record_operator_escalation for those.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          full_content: { type: "string" },
          wedding_id: { type: "string" },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_compliance_library_download_link",
      description:
        "Get a short-lived HTTPS download link for an on-file studio compliance document in Storage (public liability COI or venue/security packet). Only if the file already exists — returns error JSON if missing.",
      parameters: {
        type: "object",
        properties: {
          library_key: {
            type: "string",
            enum: ["public_liability_coi", "venue_security_compliance_packet"],
            description: "Which standard compliance library object to download.",
          },
        },
        required: ["library_key"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are Ana's operator control channel on WhatsApp for one wedding studio.

STYLE:
- Extremely short replies (prefer under 320 characters). Plain text, no email formatting, no greetings/sign-offs.
- Only state facts returned by tools. If tools return nothing, say you couldn't find it in one sentence.

COMMANDS the photographer can send: /help (what you can do), /pending (open escalations).

BEHAVIOR:
- Use tools for weddings, clients, tasks, drafts, and open escalations. Never invent CRM data.
- For anything that changes money, legal commitment, or client-facing promises without a clear studio rule, call record_operator_escalation with one concise yes/no style question. Set delivery_policy: urgent_now for time-sensitive or risk; batch_later for non-urgent FYIs; dashboard_only when no ping is needed.
- For important follow-ups that need a photographer answer by a known date, use create_awaiting_reply_task with explicit due_date (ISO) — never invent relative dates.
- For "I already got the timeline", "I met them yesterday", "remember X for this wedding" — call capture_operator_context with a clear summary.
- For the on-file COI or venue/security compliance PDF already stored in the compliance library — use get_compliance_library_download_link with the correct library_key so the photographer can open or forward a time-limited link.
- SEARCH: use a single first name or city keyword in query_weddings / query_clients, not full sentences.

CONVERSATION HISTORY may follow; use it for pronouns.`;

type OaiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

async function callOpenAI(
  messages: OaiMessage[],
  logInvocation?: ModelInvocationLogFn,
): Promise<{
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  (logInvocation ?? logModelInvocation)({
    source: "operator_orchestrator",
    model: MODEL,
    phase: "chat_completions_tools",
    workflow: "operator-whatsapp-orchestrator",
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 512,
      tools: TOOLS,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.choices[0].message;
}

async function classifyEscalationResolution(
  questionBody: string,
  photographerReply: string,
  logInvocation?: ModelInvocationLogFn,
): Promise<{ resolves: boolean; resolution_summary: string }> {
  const replyTrim = photographerReply.trim();
  if (replyTrim.length === 0) {
    return { resolves: false, resolution_summary: "" };
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const questionForPrompt = truncateOperatorOrchestratorEscalationQuestion(questionBody);
  const replyForPrompt = truncateOperatorOrchestratorEscalationReply(replyTrim);

  (logInvocation ?? logModelInvocation)({
    source: "operator_orchestrator",
    model: MODEL,
    phase: "escalation_resolution_classify",
    workflow: "operator-whatsapp-orchestrator",
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You decide if a photographer WhatsApp reply answers a pending escalation question. Return JSON only: {"resolves": boolean, "resolution_summary": string}. If resolves is true, resolution_summary must capture the operative decision in one short sentence.',
        },
        {
          role: "user",
          content: `Pending question:\n${questionForPrompt}\n\nPhotographer reply:\n${replyForPrompt}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const raw = json.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      resolves: Boolean(parsed.resolves),
      resolution_summary: String(parsed.resolution_summary ?? "").trim(),
    };
  } catch {
    return { resolves: false, resolution_summary: "" };
  }
}

async function getOperatorThreadId(photographerId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("channel", OPERATOR_CHANNEL)
    .eq("external_thread_key", OPERATOR_THREAD_EXTERNAL_KEY)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabaseAdmin
    .from("threads")
    .insert({
      photographer_id: photographerId,
      wedding_id: null,
      channel: OPERATOR_CHANNEL,
      external_thread_key: OPERATOR_THREAD_EXTERNAL_KEY,
      kind: "other",
      title: "Operator WhatsApp",
    })
    .select("id")
    .single();

  if (error || !created) throw new Error(`operator thread: ${error?.message}`);
  return created.id as string;
}

const MAX_TOOL_ROUNDS = 4;

export const operatorOrchestratorFunction = inngest.createFunction(
  { id: "operator-whatsapp-orchestrator", name: "Operator — WhatsApp orchestrator (v1)" },
  { event: WHATSAPP_OPERATOR_INBOUND_V1_EVENT },
  async ({ event, step }) => {
    const data = event.data;
    if (data.schemaVersion !== 1 || data.lane !== "operator") {
      return { status: "skipped", reason: "unexpected_payload" };
    }

    const photographerId = data.photographerId;
    const operatorFromNumber = data.operatorFromNumber;
    const rawMessage = (data.rawMessage ?? "").trim();

    if (!photographerId || !rawMessage) {
      return { status: "skipped", reason: "missing_fields" };
    }

    const runId = crypto.randomUUID();
    const eventId =
      event && typeof event === "object" && "id" in event && typeof (event as { id?: unknown }).id === "string"
        ? (event as { id: string }).id
        : undefined;
    const modelInvocationLog = createModelInvocationLogger({
      runId,
      eventId,
      workflow: "operator-whatsapp-orchestrator",
    });

    const threadId = await step.run("resolve-operator-thread", () => getOperatorThreadId(photographerId));

    const pending = await step.run("fetch-latest-open-escalation", async () => {
      return await fetchOpenEscalationForOperatorInbound(supabaseAdmin, {
        photographerId,
        operatorThreadId: threadId,
        rawMessage,
      });
    });

    if (pending) {
      const classified = await step.run("classify-escalation-reply-bundle", async () => {
        const bundle = await classifyOperatorWhatsAppEscalationResolutionBundle(
          pending.question_body,
          rawMessage,
          {
            learningContext: {
              actionKey: pending.action_key,
              weddingId: pending.wedding_id,
            },
            logInvocation: modelInvocationLog,
          },
        );
        if (!bundle.ok) {
          const legacy = await classifyEscalationResolution(
            pending.question_body,
            rawMessage,
            modelInvocationLog,
          );
          return { use: "legacy" as const, legacy };
        }
        return { use: "bundle" as const, bundle };
      });

      const resolves =
        classified.use === "legacy" ? classified.legacy.resolves : classified.bundle.resolves;
      const resolutionSummary =
        classified.use === "legacy"
          ? classified.legacy.resolution_summary
          : classified.bundle.resolution_summary;
      const prefetchedLearningOutcome =
        classified.use === "legacy" ? undefined : classified.bundle.learning_outcome;

      if (resolves && resolutionSummary) {
        await step.run("append-escalation-operator-inbound", async () => {
          await appendEscalationOperatorTurn(supabaseAdmin, {
            photographerId,
            escalationId: pending.id,
            direction: "in",
            body: rawMessage,
          });
        });

        const resolution = await step.run("resolve-operator-escalation-resolution", async () => {
          const r = await resolveOperatorEscalationResolution(supabaseAdmin, {
            photographerId,
            escalationId: pending.id,
            resolutionSummary,
            photographerReplyRaw: rawMessage,
            telemetryLogger: modelInvocationLog,
            ...(prefetchedLearningOutcome !== undefined
              ? { prefetchedLearningOutcome }
              : {}),
          });
          if (!r.ok) {
            const err = r.error;
            const msg =
              err.code === "RPC_FAILED" || err.code === "LEGACY_ATOMIC_FAILED"
                ? err.message
                : err.code === "VALIDATION_FAILED"
                  ? "VALIDATION_FAILED"
                  : err.code === "CLASSIFIER_FAILED"
                    ? err.detail
                    : err.code;
            throw new Error(`resolveOperatorEscalationResolution: ${msg}`);
          }
          return r;
        });

        const ack = await step.run("reply-escalation-ack", async () => {
          const line = `Recorded: ${resolutionSummary}`.slice(0, 1600);
          await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            photographer_id: photographerId,
            direction: "out",
            sender: "ai-assistant",
            body: line,
          });
          await supabaseAdmin
            .from("threads")
            .update({ last_outbound_at: new Date().toISOString() })
            .eq("id", threadId);
          return await sendWhatsAppMessage(operatorFromNumber, line);
        });

        const writebackPayload =
          resolution.mode === "legacy_atomic"
            ? resolution.writeback
            : { mode: "learning_loop" as const, receipt: resolution.receipt };

        return {
          status: "escalation_resolved",
          photographer_id: photographerId,
          escalation_id: pending.id,
          resolution_mode: resolution.mode,
          learning_outcome: resolution.learningOutcome,
          writeback: writebackPayload,
          twilio_sid: ack,
        };
      }
    }

    if (!pending) {
      const awaitingTask = await step.run("fetch-awaiting-reply-task", async () =>
        findEarliestOpenAwaitingReplyTask(supabaseAdmin, photographerId),
      );

      if (awaitingTask) {
        const disposition = await step.run("classify-awaiting-reply-disposition", () =>
          classifyAwaitingReplyDisposition({
            taskTitle: awaitingTask.title,
            photographerReply: rawMessage,
          }),
        );

        if (disposition !== "unresolved") {
          await step.run("apply-awaiting-reply-disposition", async () => {
            await applyAwaitingReplyDisposition(supabaseAdmin, {
              taskId: awaitingTask.id,
              photographerId,
              disposition,
            });
          });

          const ackLine =
            disposition === "answered"
              ? "Recorded your answer; follow-up task closed."
              : `Follow-up still open; due date moved forward ${DEFERRAL_DUE_POLICY_DAYS} days (studio policy).`;

          const ack = await step.run("reply-awaiting-reply-ack", async () => {
            await supabaseAdmin.from("messages").insert({
              thread_id: threadId,
              photographer_id: photographerId,
              direction: "out",
              sender: "ai-assistant",
              body: ackLine,
            });
            await supabaseAdmin
              .from("threads")
              .update({ last_outbound_at: new Date().toISOString() })
              .eq("id", threadId);
            return await sendWhatsAppMessage(operatorFromNumber, ackLine);
          });

          return {
            status: "awaiting_reply_handled",
            photographer_id: photographerId,
            task_id: awaitingTask.id,
            disposition,
            twilio_sid: ack,
          };
        }
      }
    }

    const cmd = rawMessage.trim();
    if (cmd.toLowerCase() === "/help" || cmd.toLowerCase() === "help") {
      const helpText =
        "Commands: /pending — open asks. I can look up weddings, clients, tasks, drafts. I will ask you before discounts, gifts, or delivery changes.";
      await step.run("reply-help", async () => {
        await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          photographer_id: photographerId,
          direction: "out",
          sender: "ai-assistant",
          body: helpText,
        });
        await supabaseAdmin
          .from("threads")
          .update({ last_outbound_at: new Date().toISOString() })
          .eq("id", threadId);
        return await sendWhatsAppMessage(operatorFromNumber, helpText);
      });
      return { status: "command_help", photographer_id: photographerId };
    }

    if (cmd.toLowerCase() === "/pending") {
      const text = await step.run("format-pending-escalations", async () => {
        const { data: rows } = await supabaseAdmin
          .from("escalation_requests")
          .select("id, action_key, question_body, created_at")
          .eq("photographer_id", photographerId)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(5);

        if (!rows?.length) return "No open escalations.";
        return rows
          .map(
            (r) =>
              `• ${(r.action_key as string).slice(0, 40)}: ${(r.question_body as string).slice(0, 120)}`,
          )
          .join("\n")
          .slice(0, 1500);
      });

      await step.run("reply-pending", async () => {
        await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          photographer_id: photographerId,
          direction: "out",
          sender: "ai-assistant",
          body: text,
        });
        await supabaseAdmin
          .from("threads")
          .update({ last_outbound_at: new Date().toISOString() })
          .eq("id", threadId);
        return await sendWhatsAppMessage(operatorFromNumber, text);
      });
      return { status: "command_pending", photographer_id: photographerId };
    }

    const history = await step.run("fetch-recent-messages", async () => {
      const { data: recentMessages } = await supabaseAdmin
        .from("messages")
        .select("direction, sender, body, sent_at")
        .eq("thread_id", threadId)
        .order("sent_at", { ascending: false })
        .limit(MEMORY_DEPTH);

      if (!recentMessages?.length) return [] as { role: "user" | "assistant"; content: string }[];

      return recentMessages.reverse().map((m) => ({
        role: (m.direction === "out" && m.sender === "ai-assistant" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: truncateOperatorOrchestratorChatMessage((m.body as string) ?? ""),
      }));
    });

    const escalationRecordedRef = { value: false };
    const toolCtx = { photographerId, operatorThreadId: threadId, escalationRecordedRef };

    const response = await step.run("operator-orchestrator-think", async () => {
      const inboundForChat = truncateOperatorOrchestratorChatMessage(rawMessage);

      const last = history[history.length - 1];
      const turns =
        history.length > 0 && last?.role === "user" && last.content === inboundForChat
          ? history
          : [...history, { role: "user" as const, content: inboundForChat }];

      const messages: OaiMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...turns.map((m) => ({ role: m.role, content: m.content }) as OaiMessage),
      ];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await callOpenAI(messages, modelInvocationLog);

        if (!reply.tool_calls?.length) {
          return (reply.content ?? "").trim();
        }

        messages.push({
          role: "assistant",
          content: reply.content
            ? truncateOperatorOrchestratorChatMessage(reply.content)
            : reply.content,
          tool_calls: reply.tool_calls,
        });

        for (const tc of reply.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }
          const result = await handleOperatorDataToolCall(tc.function.name, args, toolCtx);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: truncateOperatorOrchestratorToolOutput(result),
          });
        }
      }

      const final = await callOpenAI(messages, modelInvocationLog);
      return (final.content ?? "Could not complete that.").trim();
    });

    if (!response) {
      return { status: "empty_response", photographer_id: photographerId };
    }

    const sid = await step.run("log-and-send-whatsapp", async () => {
      await supabaseAdmin.from("messages").insert({
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "out",
        sender: "ai-assistant",
        body: response,
      });
      await supabaseAdmin
        .from("threads")
        .update({ last_outbound_at: new Date().toISOString() })
        .eq("id", threadId);
      if (escalationRecordedRef.value) {
        return null;
      }
      return await sendWhatsAppMessage(operatorFromNumber, response);
    });

    return {
      status: "replied",
      photographer_id: photographerId,
      response_preview: response.slice(0, 120),
      twilio_sid: sid ?? undefined,
      escalation_tool_used: escalationRecordedRef.value,
    };
  },
);
