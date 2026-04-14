import { useCallback, useEffect, useState } from "react";
import type { ChatAttachmentRow } from "../components/chat/ConversationFeed";
import { supabase } from "../lib/supabase";
import { fireDataChanged, onDataChanged } from "../lib/events";
import { useAuth } from "../context/AuthContext";
import type { GmailImportRenderHtmlRefV1 } from "../lib/gmailImportMessageMetadata";
import { mapInboxLatestProjectionRow } from "../lib/inboxThreadProjection";
import { deleteInboxThread, linkInboxThreadToWedding } from "../lib/inboxThreadLinking";

export type AiRoutingMeta = {
  suggested_wedding_id: string | null;
  confidence_score: number;
  reasoning: string;
  classified_intent: string;
};

export type UnfiledThread = {
  id: string;
  title: string;
  /** Inbox now shows all threads; `null` means still unfiled. */
  weddingId: string | null;
  last_activity_at: string;
  ai_routing_metadata: AiRoutingMeta | null;
  /** Short preview for list rows (first ~160 chars of latest message). */
  snippet: string;
  /** Full latest `messages.body` for thread detail / conversation pane (not list-truncated). */
  latestMessageBody: string;
  /** Sanitized HTML from Gmail import metadata when present. */
  latestMessageHtmlSanitized: string | null;
  /** G3: when HTML is in Storage, fetch via `fetchGmailImportHtmlForDisplay` if `latestMessageHtmlSanitized` is null. */
  gmailRenderHtmlRef: GmailImportRenderHtmlRefV1 | null;
  /** Latest canonical message id (for attachment joins). */
  latestMessageId: string | null;
  /** `message_attachments` for the latest message (e.g. Gmail import). */
  latestMessageAttachments: ChatAttachmentRow[];
  sender: string;
};

export type ActiveWedding = {
  id: string;
  couple_names: string;
};

export function useUnfiledInbox() {
  const { photographerId } = useAuth();
  const [inboxThreads, setInboxThreads] = useState<UnfiledThread[]>([]);
  const [unfiledThreads, setUnfiledThreads] = useState<UnfiledThread[]>([]);
  const [activeWeddings, setActiveWeddings] = useState<ActiveWedding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** Set when `v_threads_inbox_latest_message` or `weddings` read fails (migration missing, RLS, wrong project, etc.). */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!photographerId) {
      setInboxThreads([]);
      setUnfiledThreads([]);
      setActiveWeddings([]);
      setLoadError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    const q1 = supabase
      .from("v_threads_inbox_latest_message")
      .select(
        "id, wedding_id, title, last_activity_at, ai_routing_metadata, latest_message_id, latest_sender, latest_body, latest_message_metadata, latest_attachments_json",
      )
      .eq("photographer_id", photographerId)
      .neq("kind", "other")
      .order("last_activity_at", { ascending: false })
      .limit(200);

    const q2 = supabase
      .from("weddings")
      .select("id, couple_names")
      .eq("photographer_id", photographerId)
      .neq("stage", "archived")
      .order("couple_names", { ascending: true })
      .limit(400);

    Promise.all([q1, q2]).then(([r1, r2]) => {
      if (cancelled) return;

      const parts: string[] = [];
      if (r1.error) {
        console.error("useUnfiledInbox v_threads_inbox_latest_message:", r1.error.message, r1.error);
        parts.push(
          `Inbox view (v_threads_inbox_latest_message): ${r1.error.message}${r1.error.code ? ` [${r1.error.code}]` : ""}`,
        );
      }
      if (r2.error) {
        console.error("useUnfiledInbox weddings:", r2.error.message, r2.error);
        parts.push(
          `Weddings: ${r2.error.message}${r2.error.code ? ` [${r2.error.code}]` : ""}`,
        );
      }
      setLoadError(parts.length > 0 ? parts.join(" · ") : null);

      const threads: UnfiledThread[] = (r1.data ?? []).map((row: Record<string, unknown>) =>
        mapInboxLatestProjectionRow(row),
      );

      const weddings: ActiveWedding[] = (r2.data ?? []).map((w: Record<string, unknown>) => ({
        id: w.id as string,
        couple_names: w.couple_names as string,
      }));

      setInboxThreads(threads);
      setUnfiledThreads(threads.filter((t) => t.weddingId === null));
      setActiveWeddings(weddings);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [photographerId, fetchKey]);

  useEffect(() => onDataChanged(refetch, { scopes: ["inbox", "weddings", "all"] }), [refetch]);

  async function linkThread(threadId: string, weddingId: string) {
    setInboxThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? {
              ...t,
              weddingId,
              ai_routing_metadata: null,
            }
          : t,
      ),
    );
    setUnfiledThreads((prev) =>
      prev
        .map((t) =>
          t.id === threadId
            ? {
                ...t,
                weddingId,
                ai_routing_metadata: null,
              }
            : t,
        )
        .filter((t) => t.weddingId === null),
    );

    const result = await linkInboxThreadToWedding({ threadId, weddingId });

    if (!result.ok) {
      console.error("linkThread error:", result.error);
      refetch();
      return;
    }

    fireDataChanged("inbox");
    fireDataChanged("weddings");
  }

  async function deleteThread(threadId: string) {
    setInboxThreads((prev) => prev.filter((t) => t.id !== threadId));
    setUnfiledThreads((prev) => prev.filter((t) => t.id !== threadId));

    const result = await deleteInboxThread(threadId);

    if (!result.ok) {
      console.error("deleteThread error:", result.error);
      refetch();
      return;
    }

    fireDataChanged("inbox");
  }

  return {
    inboxThreads,
    unfiledThreads,
    activeWeddings,
    isLoading,
    loadError,
    linkThread,
    deleteThread,
    refetch,
  };
}
