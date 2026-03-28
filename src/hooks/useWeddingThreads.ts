import { useEffect, useState } from "react";
import {
  getMessagesForThread,
  getThreadById,
  getThreadsForWedding,
  type WeddingThreadMessage,
} from "../data/weddingThreads";
import {
  buildDraftPendingByThread,
  defaultExpandedForWeddingMessage,
} from "../lib/weddingDetailUtils";

export function useWeddingThreads({
  weddingId,
  showToast,
}: {
  weddingId: string;
  showToast: (message: string) => void;
}) {
  const threads = getThreadsForWedding(weddingId);
  const [selectedThreadId, setSelectedThreadId] = useState(() => threads[0]?.id ?? "");
  const [draftPendingByThread, setDraftPendingByThread] = useState<Record<string, boolean>>(() =>
    buildDraftPendingByThread(threads),
  );
  const [messageExpanded, setMessageExpanded] = useState<Record<string, boolean>>({});
  const [draftExpanded, setDraftExpanded] = useState(true);

  const activeThread = getThreadById(selectedThreadId) ?? threads[0];
  const timelineMessages = activeThread ? getMessagesForThread(activeThread.id) : [];
  const earlierMessages = timelineMessages.filter((msg) => msg.daySegment === "earlier");
  const todayMessages = timelineMessages.filter((msg) => msg.daySegment === "today");
  const showDraft =
    activeThread?.hasPendingDraft === true && draftPendingByThread[activeThread.id] === true;

  useEffect(() => {
    const nextThreads = getThreadsForWedding(weddingId);
    setSelectedThreadId(nextThreads[0]?.id ?? "");
    setDraftPendingByThread(buildDraftPendingByThread(nextThreads));
    setMessageExpanded({});
  }, [weddingId]);

  function toggleMessage(foldKey: string) {
    setMessageExpanded((prev) => ({ ...prev, [foldKey]: !prev[foldKey] }));
  }

  function defaultExpandedForMessage(msg: WeddingThreadMessage): boolean {
    return defaultExpandedForWeddingMessage(msg);
  }

  function toggleDraftExpanded() {
    setDraftExpanded((expanded) => !expanded);
  }

  function approveDraft() {
    if (!activeThread) return;
    setDraftPendingByThread((prev) => ({ ...prev, [activeThread.id]: false }));
    showToast("Message queued â€” sent to Elena Rossi Planning (demo).");
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
    messageExpanded,
    toggleMessage,
    defaultExpandedForMessage,
    draftExpanded,
    toggleDraftExpanded,
    approveDraft,
  };
}
