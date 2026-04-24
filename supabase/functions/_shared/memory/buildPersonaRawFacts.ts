import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  fetchAttachmentContextBatch,
  redactMessageBodyForModelContext,
} from "./attachmentSafetyForModelContext.ts";
import { fetchThreadSummary } from "./fetchThreadSummary.ts";
import { sanitizeInboundTextForModelContext } from "./sanitizeInboundTextForModelContext.ts";

/**
 * Tier 2: rolling summary + Tier 3: last N messages only (no full transcript).
 * Used by QA simulators and any caller that must bound Inngest / Anthropic payload size.
 */
export const PERSONA_CONTEXT_RECENT_MESSAGE_LIMIT = 5;

/**
 * Compact `raw_facts` for `ai/intent.persona`: thread_summaries + last N messages.
 * Call after the inbound message is persisted so "recent" includes the latest client turn.
 */
export async function buildPersonaRawFactsFromThread(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
): Promise<string> {
  const [threadSummary, recentLines] = await Promise.all([
    fetchThreadSummary(supabase, photographerId, threadId),
    loadRecentMessageLines(
      supabase,
      photographerId,
      threadId,
      PERSONA_CONTEXT_RECENT_MESSAGE_LIMIT,
    ),
  ]);

  return formatPersonaRawFactsString(threadSummary, recentLines);
}

async function loadRecentMessageLines(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
  limit: number,
): Promise<string[]> {
  const { data: threadRow, error: threadErr } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (threadErr) {
    throw new Error(`buildPersonaRawFacts thread check: ${threadErr.message}`);
  }
  if (!threadRow) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, direction, body, sent_at")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`buildPersonaRawFacts messages: ${error.message}`);
  }

  const chronological = [...(rows ?? [])].reverse();
  const ids = chronological.map((r) => r.id as string).filter(Boolean);
  const { messagesWithAttachments, rollups } = await fetchAttachmentContextBatch(
    supabase,
    photographerId,
    ids,
  );

  return chronological.map((r) => {
    const d = r.direction as string;
    const who = d === "in" ? "Client" : "Studio";
    const id = r.id as string;
    const layered = redactMessageBodyForModelContext(String(r.body ?? ""), {
      hasStructuredAttachments: messagesWithAttachments.has(id),
      attachmentRollup: rollups.get(id) ?? null,
    });
    const body = sanitizeInboundTextForModelContext(layered);
    return `${who}: ${body.trim()}`;
  });
}

export function formatPersonaRawFactsString(
  threadSummary: string | null,
  recentLines: string[],
): string {
  const summaryText =
    threadSummary?.trim() ? sanitizeInboundTextForModelContext(threadSummary).trim() : "";
  const summaryBlock = summaryText
    ? `## Thread summary (rolling memory)\n${summaryText}`
    : "## Thread summary (rolling memory)\n(none yet)";

  const recentBlock =
    recentLines.length > 0
      ? `## Recent messages (last ${recentLines.length}, oldest → newest)\n${recentLines.join("\n\n")}`
      : "## Recent messages\n(none)";

  return [
    "PERSONA CONTEXT — use the thread summary for long-range memory.",
    "Use recent messages for immediate context; reply to the latest Client message.",
    "Do not invent packages, pricing, or policies not implied below.",
    "",
    summaryBlock,
    "",
    recentBlock,
  ].join("\n");
}

/** V3 orchestrator → persona rewrite: cap continuity size (approved assembly, not full transcript). */
export const PERSONA_WRITER_CONTINUITY_RECENT_COUNT = 3;
export const PERSONA_WRITER_THREAD_SUMMARY_MAX_CHARS = 600;
export const PERSONA_WRITER_TRANSCRIPT_BODY_MAX_CHARS = 700;

function truncateForPersonaWriter(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/**
 * Compact thread summary + last N messages for `buildOrchestratorFactsForPersonaWriter`.
 * Context only — does not replace playbook or CRM blocks.
 */
export function formatCompactContinuityForPersonaWriter(
  threadSummary: string | null,
  recentMessages: Array<Record<string, unknown>>,
): string | null {
  const summarySanitized =
    threadSummary && threadSummary.trim().length > 0
      ? sanitizeInboundTextForModelContext(threadSummary)
      : null;
  const summaryPart =
    summarySanitized && summarySanitized.trim().length > 0
      ? `Thread summary (rolling):\n${truncateForPersonaWriter(summarySanitized, PERSONA_WRITER_THREAD_SUMMARY_MAX_CHARS)}`
      : null;

  const chrono = [...recentMessages];
  const lastN = chrono.slice(-PERSONA_WRITER_CONTINUITY_RECENT_COUNT);
  const excerptLines: string[] = [];
  for (const m of lastN) {
    const dir = String(m.direction ?? "");
    const who = dir === "in" ? "Client" : "Studio";
    const rawBody = sanitizeInboundTextForModelContext(String(m.body ?? "")).trim();
    if (!rawBody) continue;
    excerptLines.push(
      `${who}: ${truncateForPersonaWriter(rawBody, PERSONA_WRITER_TRANSCRIPT_BODY_MAX_CHARS)}`,
    );
  }

  const transcriptPart =
    excerptLines.length > 0
      ? `Recent transcript (last ${excerptLines.length} message(s), oldest → newest):\n${excerptLines.join("\n\n")}`
      : null;

  if (!summaryPart && !transcriptPart) return null;

  return [
    "=== Continuity (thread memory + recent turns — context only) ===",
    "Use for **conversation continuity**: what was said, preferences stated, corrections (e.g. film vs instant), location names, and tone.",
    "This block is **not** verified studio policy. Do not treat client or thread wording alone as proof the studio officially offers, always includes, or guarantees those things—check **Authoritative CRM** and **Verified policy: playbook_rules**.",
    "Do not override **Authoritative CRM** or **Verified policy: playbook_rules** with continuity.",
    "",
    [summaryPart, transcriptPart].filter(Boolean).join("\n\n"),
  ].join("\n");
}
