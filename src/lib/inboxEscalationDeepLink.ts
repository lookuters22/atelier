import { supabase } from "./supabase";
import type { UnfiledThread } from "../hooks/useUnfiledInbox";
import { fetchGmailImportHtmlForDisplay } from "./gmailImportMessageMetadata";
import { mapInboxLatestProjectionRow } from "./inboxThreadProjection";

/**
 * Load a thread by id for `/inbox?threadId=&escalationId=` when the thread is not in the unfiled list.
 * Uses `v_threads_inbox_latest_message` (G4) — same projection as the unfiled list.
 */
export async function fetchThreadRowForEscalationDeepLink(threadId: string): Promise<UnfiledThread | null> {
  const { data, error } = await supabase
    .from("v_threads_inbox_latest_message")
    .select(
      "id, title, last_activity_at, ai_routing_metadata, latest_message_id, latest_sender, latest_body, latest_message_metadata, latest_attachments_json",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (error || !data) return null;

  const mapped = mapInboxLatestProjectionRow(data as Record<string, unknown>);
  if (mapped.latestMessageHtmlSanitized || !mapped.gmailRenderHtmlRef) return mapped;
  const html = await fetchGmailImportHtmlForDisplay(supabase, mapped.gmailRenderHtmlRef);
  return html ? { ...mapped, latestMessageHtmlSanitized: html } : mapped;
}
