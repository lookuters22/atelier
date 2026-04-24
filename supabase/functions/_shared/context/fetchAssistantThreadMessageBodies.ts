import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantOperatorThreadMessageBodiesSnapshot } from "../../../../src/types/assistantContext.types.ts";
import {
  fetchAttachmentContextBatch,
  redactMessageBodyForModelContext,
} from "../memory/attachmentSafetyForModelContext.ts";
import { sanitizeInboundTextForModelContext } from "../memory/sanitizeInboundTextForModelContext.ts";

/** Most recent messages fetched (newest first from DB, reversed to chronological for display). */
export const MAX_THREAD_MESSAGES_IN_SNAPSHOT = 8;
/** Per-message UTF-8 body cap (storage may be longer). */
export const MAX_MESSAGE_BODY_CHARS_IN_SNAPSHOT = 900;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const IDLE_ASSISTANT_THREAD_MESSAGE_BODIES: AssistantOperatorThreadMessageBodiesSnapshot = {
  didRun: false,
  selectionNote: "not loaded",
  threadId: null,
  threadTitle: null,
  messages: [],
  truncatedOverall: false,
};

function clipBody(raw: string, max: number): { text: string; clipped: boolean } {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (t.length <= max) return { text: t, clipped: false };
  return { text: t.slice(0, max), clipped: true };
}

/**
 * Read-only, tenant-scoped: recent `messages` for one `threads.id`.
 * Verifies `threads.photographer_id` and filters `messages` by the same tenant.
 */
export async function fetchAssistantThreadMessageBodies(
  supabase: SupabaseClient,
  photographerId: string,
  threadIdRaw: unknown,
): Promise<AssistantOperatorThreadMessageBodiesSnapshot> {
  const threadId = String(threadIdRaw ?? "").trim();
  if (!UUID_RE.test(threadId)) {
    return { ...IDLE_ASSISTANT_THREAD_MESSAGE_BODIES, selectionNote: "invalid_thread_id" };
  }

  const { data: thread, error: terr } = await supabase
    .from("threads")
    .select("id, title, photographer_id")
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (terr) {
    throw new Error(`fetchAssistantThreadMessageBodies thread: ${terr.message}`);
  }
  if (thread == null) {
    return {
      didRun: true,
      selectionNote: "thread_not_found_or_denied",
      threadId,
      threadTitle: null,
      messages: [],
      truncatedOverall: false,
    };
  }

  const title = String((thread as { title?: string }).title ?? "");

  const { data: rows, error: merr } = await supabase
    .from("messages")
    .select("id, direction, sender, body, sent_at")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId)
    .order("sent_at", { ascending: false })
    .limit(MAX_THREAD_MESSAGES_IN_SNAPSHOT);

  if (merr) {
    throw new Error(`fetchAssistantThreadMessageBodies messages: ${merr.message}`);
  }

  const list = (rows ?? []) as Array<{
    id: string;
    direction: string;
    sender: string;
    body: string;
    sent_at: string;
  }>;

  let truncatedOverall = list.length >= MAX_THREAD_MESSAGES_IN_SNAPSHOT;
  const chronological = [...list].reverse();

  const messageIds = chronological.map((r) => String(r.id)).filter(Boolean);
  const { messagesWithAttachments, rollups } = await fetchAttachmentContextBatch(
    supabase,
    photographerId,
    messageIds,
  );

  const messages = chronological.map((r) => {
    const mid = String(r.id);
    const raw = String(r.body ?? "");
    const layered = redactMessageBodyForModelContext(raw, {
      hasStructuredAttachments: messagesWithAttachments.has(mid),
      attachmentRollup: rollups.get(mid) ?? null,
    });
    const sanitized = sanitizeInboundTextForModelContext(layered);
    const { text, clipped } = clipBody(sanitized, MAX_MESSAGE_BODY_CHARS_IN_SNAPSHOT);
    if (clipped) truncatedOverall = true;
    return {
      messageId: String(r.id),
      direction: String(r.direction),
      sender: String(r.sender ?? ""),
      sentAt: String(r.sent_at),
      bodyExcerpt: text,
      bodyClipped: clipped,
    };
  });

  return {
    didRun: true,
    selectionNote: "messages_loaded",
    threadId,
    threadTitle: title,
    messages,
    truncatedOverall,
  };
}
