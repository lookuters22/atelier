/**
 * Optimized Assembly Line — Master Routing for Atelier OS.
 *
 * Order: Deterministic Check → Stage Gate → Traffic Cop (Intent) → Conditional Matchmaker → Dispatch/Unfiled
 *
 * CRITICAL: The project_stage is fetched BEFORE the LLM runs.
 * Hardcoded guards prevent the LLM from routing to agents that are
 * invalid for the current lifecycle phase. This eliminates hallucinated routing.
 *
 * Every step uses Inngest step.run() for durable execution (.cursorrules §4).
 */
import { inngest, type AtelierEvents } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { runTriageAgent, type TriageIntent } from "../../_shared/agents/triage.ts";
import { runMatchmakerAgent, type MatchmakerResult } from "../../_shared/agents/matchmaker.ts";

// ── Stage-based routing rules ────────────────────────────────────

type StageGroup = "new_lead" | "pre_booking" | "active" | "post_wedding";

const STAGE_GROUP_MAP: Record<string, StageGroup> = {
  inquiry: "new_lead",
  consultation: "pre_booking",
  proposal_sent: "pre_booking",
  contract_out: "pre_booking",
  booked: "active",
  prep: "active",
  final_balance: "active",
  delivered: "post_wedding",
  archived: "post_wedding",
};

const ALLOWED_INTENTS: Record<StageGroup, ReadonlySet<TriageIntent>> = {
  new_lead: new Set(["intake"]),
  pre_booking: new Set(["intake", "commercial", "concierge"]),
  active: new Set(["concierge", "project_management", "logistics", "commercial"]),
  post_wedding: new Set(["studio", "concierge"]),
};

const FALLBACK_INTENT: Record<StageGroup, TriageIntent> = {
  new_lead: "intake",
  pre_booking: "concierge",
  active: "concierge",
  post_wedding: "studio",
};

function enforceStageGate(
  llmIntent: TriageIntent,
  stage: string | null,
  hasWedding: boolean,
): TriageIntent {
  if (!hasWedding || !stage) return "intake";

  const group = STAGE_GROUP_MAP[stage] ?? "new_lead";
  const allowed = ALLOWED_INTENTS[group];

  if (allowed.has(llmIntent)) return llmIntent;

  return FALLBACK_INTENT[group];
}

// ── Helpers ──────────────────────────────────────────────────────

function extractSenderAndBody(payload: Record<string, unknown>): {
  sender: string;
  body: string;
} {
  const sender =
    typeof payload.from === "string"
      ? payload.from
      : typeof payload.sender === "string"
        ? payload.sender
        : typeof payload.email === "string"
          ? payload.email
          : typeof payload.phone === "string"
            ? payload.phone
            : "";

  const body =
    typeof payload.body === "string"
      ? payload.body
      : typeof payload.text === "string"
        ? payload.text
        : typeof payload.message === "string"
          ? payload.message
          : JSON.stringify(payload);

  return { sender, body };
}

const INTENT_EVENT_MAP: Record<TriageIntent, keyof AtelierEvents> = {
  intake: "ai/intent.intake",
  commercial: "ai/intent.commercial",
  logistics: "ai/intent.logistics",
  project_management: "ai/intent.project_management",
  concierge: "ai/intent.concierge",
  studio: "ai/intent.studio",
};

// ── Inngest function ─────────────────────────────────────────────

export const triageFunction = inngest.createFunction(
  { id: "traffic-cop-triage", name: "Traffic Cop — Optimized Assembly Line" },
  [
    { event: "comms/email.received" },
    { event: "comms/whatsapp.received" },
    { event: "comms/web.received" },
  ],
  async ({ event, step }) => {
    // ── HARD RULE: WhatsApp = boss's private line → Internal Concierge ──
    if (event.name === "comms/whatsapp.received") {
      const raw = (event.data as Record<string, unknown>) ?? {};
      const payload = (raw.raw_message as Record<string, unknown>) ?? {};
      const fromNumber = typeof payload.from === "string" ? payload.from : "";
      const messageBody = typeof payload.body === "string" ? payload.body : JSON.stringify(payload);
      const photographerId = typeof raw.photographer_id === "string" ? raw.photographer_id : "";

      console.log(`[triage] WhatsApp received — bypassing email pipeline. From: ${fromNumber}, photographer: ${photographerId}`);

      await step.run("dispatch-internal-concierge", async () => {
        await inngest.send({
          name: "ai/intent.internal_concierge",
          data: {
            photographer_id: photographerId,
            from_number: fromNumber,
            raw_message: messageBody,
          },
        });
      });

      return {
        status: "routed_whatsapp_internal",
        photographer_id: photographerId,
        from_number: fromNumber,
      };
    }

    // ── Source detection (email / web only from this point) ────────
    const isWebWidget = event.name === "comms/web.received";

    const replyChannel: "email" | "whatsapp" | "web" =
      event.name === "comms/web.received" ? "web" : "email";

    const raw = (event.data as Record<string, unknown>) ?? {};
    const payload =
      "raw_email" in raw
        ? (raw.raw_email as Record<string, unknown>)
        : "raw_message" in raw
          ? (raw.raw_message as Record<string, unknown>) ?? {}
          : raw;

    const payloadPhotographerId =
      typeof raw.photographer_id === "string" ? raw.photographer_id : null;

    const { sender, body } = extractSenderAndBody(
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {},
    );

    // ── Step 1: Deterministic Identity + Stage ────────────────────
    const identity = await step.run("deterministic-identity", async () => {
      let weddingId: string | null = null;
      let photographerId: string | null = null;
      let projectStage: string | null = null;

      if (sender) {
        const { data: client } = await supabaseAdmin
          .from("clients")
          .select("wedding_id")
          .eq("email", sender)
          .limit(1)
          .maybeSingle();

        weddingId = (client?.wedding_id as string) ?? null;
      }

      if (weddingId) {
        const { data: wedding } = await supabaseAdmin
          .from("weddings")
          .select("photographer_id, stage")
          .eq("id", weddingId)
          .single();

        photographerId = (wedding?.photographer_id as string) ?? null;
        projectStage = (wedding?.stage as string) ?? null;
      }

      return { weddingId, photographerId, projectStage };
    });

    // ── Web widget fast-path (known wedding) ────────────────────
    if (isWebWidget && identity.weddingId) {
      const threadId = await step.run("persist-internal-command", async () => {
        const { data: thread, error: threadErr } = await supabaseAdmin
          .from("threads")
          .insert({
            wedding_id: identity.weddingId!,
            title: body.slice(0, 60),
            kind: "group",
          })
          .select("id")
          .single();

        if (threadErr || !thread) {
          throw new Error(`Failed to create thread: ${threadErr?.message}`);
        }

        const id = thread.id as string;

        const { error: msgErr } = await supabaseAdmin.from("messages").insert({
          thread_id: id,
          direction: "in",
          sender: sender || "widget",
          body,
        });

        if (msgErr) throw new Error(`Failed to insert message: ${msgErr.message}`);
        return id;
      });

      await step.run("dispatch-web-concierge", async () => {
        await inngest.send({
          name: "ai/intent.concierge",
          data: {
            wedding_id: identity.weddingId!,
            raw_message: body,
            reply_channel: replyChannel,
          },
        });
      });

      return {
        status: "routed_internal",
        weddingId: identity.weddingId,
        intent: "concierge",
        reply_channel: replyChannel,
        threadId,
      };
    }

    // ── Step 2: Traffic Cop (Intent Classification) ──────────────
    const llmIntent = await step.run("classify-intent", async () => {
      return runTriageAgent(body);
    });

    // ── Step 2b: Stage Gate — override LLM if invalid for stage ──
    const intent = enforceStageGate(
      llmIntent,
      identity.projectStage,
      !!identity.weddingId,
    );

    // ── Step 3: Conditional Matchmaker ───────────────────────────
    const matchResult = await step.run("conditional-matchmaker", async () => {
      if (identity.weddingId) {
        return { weddingId: identity.weddingId, match: null as MatchmakerResult | null };
      }

      if (intent === "intake") {
        return { weddingId: null as string | null, match: null as MatchmakerResult | null };
      }

      const { data: activeWeddings } = await supabaseAdmin
        .from("weddings")
        .select("id, couple_names, wedding_date, location, stage")
        .neq("stage", "archived")
        .neq("stage", "delivered");

      if (!activeWeddings || activeWeddings.length === 0) {
        return { weddingId: null as string | null, match: null as MatchmakerResult | null };
      }

      const match = await runMatchmakerAgent(
        body,
        activeWeddings as Record<string, unknown>[],
      );

      const resolvedWeddingId =
        match.confidence_score >= 90 ? match.suggested_wedding_id : null;

      if (resolvedWeddingId) {
        const { data: wedding } = await supabaseAdmin
          .from("weddings")
          .select("photographer_id")
          .eq("id", resolvedWeddingId)
          .single();

        return {
          weddingId: resolvedWeddingId,
          photographerId: (wedding?.photographer_id as string) ?? identity.photographerId,
          match,
        };
      }

      return { weddingId: null as string | null, match };
    });

    const finalWeddingId = matchResult.weddingId ?? identity.weddingId;
    const finalPhotographerId =
      (matchResult as Record<string, unknown>).photographerId as string | null
      ?? identity.photographerId
      ?? payloadPhotographerId;

    // ── Step 4: Database & Dispatch ──────────────────────────────
    const threadInfo = await step.run("persist-thread-and-message", async () => {
      const subject =
        typeof (payload as Record<string, unknown>).subject === "string"
          ? ((payload as Record<string, unknown>).subject as string)
          : body.slice(0, 60);

      const routingMetadata =
        !finalWeddingId && matchResult.match
          ? {
              suggested_wedding_id: matchResult.match.suggested_wedding_id,
              confidence_score: matchResult.match.confidence_score,
              reasoning: matchResult.match.reasoning,
              classified_intent: intent,
            }
          : null;

      const { data: thread, error: threadErr } = await supabaseAdmin
        .from("threads")
        .insert({
          wedding_id: finalWeddingId ?? undefined,
          title: subject,
          kind: "group",
          ai_routing_metadata: routingMetadata,
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
        sender: sender || "unknown",
        body,
      });

      if (msgErr) {
        throw new Error(`Failed to insert message: ${msgErr.message}`);
      }

      return { threadId, routingMetadata };
    });

    // ── Failsafe: Unfiled Inbox ──────────────────────────────────
    if (intent !== "intake" && !finalWeddingId) {
      return {
        status: "unfiled",
        sender,
        intent,
        llmIntent,
        reply_channel: replyChannel,
        threadId: threadInfo.threadId,
        matchSuggestion: threadInfo.routingMetadata,
      };
    }

    // ── Dispatch downstream event ────────────────────────────────
    await step.run("dispatch-event", async () => {
      const eventName = INTENT_EVENT_MAP[intent];

      if (eventName === "ai/intent.intake") {
        await inngest.send({
          name: "ai/intent.intake",
          data: {
            photographer_id: finalPhotographerId ?? "",
            wedding_id: finalWeddingId ?? undefined,
            thread_id: threadInfo.threadId,
            raw_message: body,
            sender_email: sender,
            reply_channel: replyChannel,
          },
        });
      } else {
        await inngest.send({
          name: eventName,
          data: {
            wedding_id: finalWeddingId!,
            raw_message: body,
            reply_channel: replyChannel,
          },
        });
      }
    });

    return {
      status: "routed",
      weddingId: finalWeddingId,
      projectStage: identity.projectStage,
      llmIntent,
      enforcedIntent: intent,
      reply_channel: replyChannel,
      threadId: threadInfo.threadId,
    };
  },
);
