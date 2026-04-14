import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nextWeddingTimelineThreadId } from "./weddingTimelineThreadSelection";
import type { WeddingThread, WeddingThreadMessage } from "../data/weddingThreads";
import type { Tables } from "../types/database.types";
import type { ThreadWithDrafts } from "./useWeddingProject";
import { supabase } from "../lib/supabase";
import { enqueueDraftApprovedForOutbound } from "../lib/draftApprovalClient";
import { fireDataChanged } from "../lib/events";

type DbThread = ThreadWithDrafts;

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(iso)) {
    return `Today \u00b7 ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} \u00b7 ${time}`;
}

function mapThread(t: DbThread): WeddingThread {
  return {
    id: t.id,
    weddingId: t.wedding_id ?? "",
    title: t.title,
    participantHint: "",
    kind: t.kind,
    lastActivityLabel: t.last_activity_at ? formatTime(t.last_activity_at) : "No activity",
  };
}

function mapMessage(m: Tables<"messages">, idx: number): WeddingThreadMessage {
  return {
    id: m.id,
    threadId: m.thread_id,
    direction: m.direction === "internal" ? "out" : m.direction,
    sender: m.sender,
    meta: m.direction === "internal" ? "Internal note" : undefined,
    time: formatTime(m.sent_at),
    body: m.body,
    daySegment: isToday(m.sent_at) ? "today" : "earlier",
    sortOrder: idx,
  };
}

export function useWeddingThreads({
  weddingId,
  photographerId,
  liveThreads,
  showToast,
  /** Inbox draft deep link: canonical URL `threadId` — wins over default `threads[0]` when present in list. */
  preferredTimelineThreadId,
  /** From `useWeddingProject.timelineFetchEpoch` — refetch messages when timeline reloads (drafts, etc.). */
  timelineFetchEpoch = 0,
}: {
  weddingId: string;
  photographerId: string;
  liveThreads: DbThread[];
  showToast: (message: string) => void;
  preferredTimelineThreadId?: string | null;
  timelineFetchEpoch?: number;
}) {
  const threads = useMemo(() => liveThreads.map(mapThread), [liveThreads]);

  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draftPendingByThread, setDraftPendingByThread] = useState<Record<string, boolean>>({});
  const [messageExpanded, setMessageExpanded] = useState<Record<string, boolean>>({});
  const [draftExpanded, setDraftExpanded] = useState(true);
  /** True after we picked `threads[0]` while URL preferred a thread not yet present in `liveThreads`. */
  const didAutoPickFirstAwaitingPreferredRef = useRef(false);

  useEffect(() => {
    setMessageExpanded({});
    setDraftPendingByThread({});
    didAutoPickFirstAwaitingPreferredRef.current = false;
  }, [weddingId]);

  useEffect(() => {
    const threadIds = threads.map((t) => t.id);
    const next = nextWeddingTimelineThreadId(
      threadIds,
      selectedThreadId,
      preferredTimelineThreadId,
      didAutoPickFirstAwaitingPreferredRef.current,
    );
    if (!next) return;
    setSelectedThreadId(next.selected);
    didAutoPickFirstAwaitingPreferredRef.current = next.markAwaitingPreferred;
  }, [threads, selectedThreadId, preferredTimelineThreadId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? threads[0],
    [threads, selectedThreadId],
  );

  /** A1: one thread’s messages at a time — not nested in `useWeddingProject`. */
  const [activeThreadMessages, setActiveThreadMessages] = useState<Tables<"messages">[]>([]);
  const [messagesRefreshNonce, setMessagesRefreshNonce] = useState(0);

  const refreshActiveThreadMessages = useCallback(() => {
    setMessagesRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const tid = activeThread?.id;
    if (!tid) {
      setActiveThreadMessages([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("messages")
      .select("*")
      .eq("thread_id", tid)
      .order("sent_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useWeddingThreads messages:", error.message);
          setActiveThreadMessages([]);
          return;
        }
        const rows = data ?? [];
        setActiveThreadMessages([...rows].reverse());
      });
    return () => {
      cancelled = true;
    };
  }, [activeThread?.id, timelineFetchEpoch, messagesRefreshNonce]);

  const allMessages = useMemo(() => {
    if (!activeThread?.id) return [];
    return activeThreadMessages.map((m, idx) => mapMessage(m, idx));
  }, [activeThread, activeThreadMessages]);

  const earlierMessages = useMemo(
    () => allMessages.filter((msg) => msg.daySegment === "earlier"),
    [allMessages],
  );
  const todayMessages = useMemo(
    () => allMessages.filter((msg) => msg.daySegment === "today"),
    [allMessages],
  );

  const pendingDraft = useMemo(() => {
    const dbThread = liveThreads.find((t) => t.id === activeThread?.id);
    if (!dbThread?.drafts) return null;
    return dbThread.drafts.find((d) => d.status === "pending_approval") ?? null;
  }, [liveThreads, activeThread]);

  const showDraft = pendingDraft !== null;
  const draftDefault = pendingDraft?.body ?? null;

  function toggleMessage(foldKey: string) {
    setMessageExpanded((prev) => ({ ...prev, [foldKey]: !prev[foldKey] }));
  }

  function defaultExpandedForMessage(msg: WeddingThreadMessage): boolean {
    return msg.daySegment === "today";
  }

  function toggleDraftExpanded() {
    setDraftExpanded((expanded) => !expanded);
  }

  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null);

  async function approveDraft() {
    if (!activeThread || !pendingDraft) return;
    setApprovingDraftId(pendingDraft.id);
    try {
      await enqueueDraftApprovedForOutbound(pendingDraft.id);
      setDraftPendingByThread((prev) => ({ ...prev, [activeThread.id]: false }));
      showToast("Message approved and queued for sending.");
      fireDataChanged("drafts");
    } catch (err) {
      console.error("approveDraft failed:", err);
      showToast("Failed to approve draft. Please try again.");
    } finally {
      setApprovingDraftId(null);
    }
  }

  return {
    threads,
    selectedThreadId,
    setSelectedThreadId,
    activeThread,
    earlierMessages,
    todayMessages,
    draftPendingByThread,
    showDraft,
    draftDefault,
    messageExpanded,
    toggleMessage,
    defaultExpandedForMessage,
    draftExpanded,
    toggleDraftExpanded,
    approveDraft,
    approvingDraftId,
    refreshActiveThreadMessages,
  };
}
