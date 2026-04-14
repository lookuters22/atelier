import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scrollPipelineWeddingRowIntoView } from "../../lib/pipelineWeddingListNavigation";
import {
  adjacentThreadId,
  isEditableKeyboardTarget,
  threadQueuePosition,
  timelineThreadAltArrowDelta,
} from "../../lib/timelineThreadNavigation";
import {
  messageFoldKey,
  type WeddingThread,
  type WeddingThreadMessage,
} from "../../data/weddingThreads";
import { ConversationFeed, type ChatMessage } from "../chat/ConversationFeed";

function mapToChatMessage(msg: WeddingThreadMessage): ChatMessage {
  return {
    id: msg.id,
    direction: msg.direction,
    sender: msg.sender,
    body: msg.body,
    time: msg.time,
    meta: msg.meta,
  };
}

export function TimelineTab({
  activeThread,
  threads,
  earlierMessages,
  todayMessages,
  messageExpanded,
  defaultExpandedForMessage,
  toggleMessage,
  setSelectedThreadId,
  showDraft,
  draftExpanded,
  toggleDraftExpanded,
  approveDraft,
  isApprovingDraft,
  editDraftInComposer,
  draftDefault,
}: {
  activeThread: WeddingThread | undefined;
  threads: WeddingThread[];
  earlierMessages: WeddingThreadMessage[];
  todayMessages: WeddingThreadMessage[];
  messageExpanded: Record<string, boolean>;
  defaultExpandedForMessage: (msg: WeddingThreadMessage) => boolean;
  toggleMessage: (foldKey: string) => void;
  setSelectedThreadId: (threadId: string) => void;
  showDraft: boolean;
  draftExpanded: boolean;
  toggleDraftExpanded: () => void;
  approveDraft: () => void;
  isApprovingDraft: boolean;
  editDraftInComposer: () => void;
  draftDefault: string;
}) {
  const earlier = useMemo(() => earlierMessages.map(mapToChatMessage), [earlierMessages]);
  const today = useMemo(() => todayMessages.map(mapToChatMessage), [todayMessages]);

  const threadId = activeThread?.id ?? "";
  const todayIds = useMemo(() => new Set(todayMessages.map((m) => m.id)), [todayMessages]);

  const threadChipsWrapRef = useRef<HTMLDivElement>(null);

  const threadQueuePos = useMemo(
    () => threadQueuePosition(threads, activeThread?.id),
    [threads, activeThread?.id],
  );

  useLayoutEffect(() => {
    if (threads.length < 2 || !activeThread?.id) return;
    const root = threadChipsWrapRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-timeline-thread-chip="${CSS.escape(activeThread.id)}"]`);
    if (el instanceof HTMLElement) scrollPipelineWeddingRowIntoView(el);
  }, [threads.length, activeThread?.id]);

  useEffect(() => {
    if (threads.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = timelineThreadAltArrowDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentThreadId(threads, activeThread?.id, delta);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedThreadId(id);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [threads, activeThread?.id, setSelectedThreadId]);

  const draftSlot = showDraft ? (
    <div className="flex justify-end gap-2.5">
      <div className="flex max-w-[75%] flex-col items-end">
        <button
          type="button"
          onClick={toggleDraftExpanded}
          className="rounded-2xl rounded-br-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-foreground transition"
        >
          <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">
            Pending approval
          </span>
          {draftExpanded ? (
            <span className="block whitespace-pre-wrap">{draftDefault}</span>
          ) : (
            <span className="line-clamp-3 block">{draftDefault}</span>
          )}
        </button>
        {draftExpanded && (
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={isApprovingDraft}
              className="rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-60"
              onClick={(e) => {
                e.stopPropagation();
                approveDraft();
              }}
            >
              {isApprovingDraft ? "Sending\u2026" : "Approve & send"}
            </button>
            <button
              type="button"
              disabled={isApprovingDraft}
              className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation();
                editDraftInComposer();
              }}
            >
              Edit
            </button>
          </div>
        )}
      </div>
      <div className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
        ED
      </div>
    </div>
  ) : (
    <p className="text-center text-[11px] text-muted-foreground">
      No pending drafts. Use the message box below.
    </p>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="shrink-0 space-y-2 border-b border-border bg-background px-4 py-2.5">
        <div className="text-center">
          <p className="text-[12px] font-semibold text-foreground">
            {activeThread?.title ?? "Thread"}
          </p>
          {activeThread?.participantHint ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {activeThread.participantHint}
            </p>
          ) : null}
          {threads.length > 1 && threadQueuePos ? (
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
              Thread {threadQueuePos.current} of {threadQueuePos.total}
            </p>
          ) : null}
        </div>
        {threads.length > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              title="Previous thread (Alt+←)"
              aria-label="Previous thread"
              onClick={() => {
                const id = adjacentThreadId(threads, activeThread?.id, -1);
                if (id) setSelectedThreadId(id);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <div
              ref={threadChipsWrapRef}
              className="flex max-w-full flex-1 flex-wrap justify-center gap-1.5"
            >
              {threads.map((t) => {
                const on = t.id === activeThread?.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-timeline-thread-chip={t.id}
                    onClick={() => setSelectedThreadId(t.id)}
                    className={
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
                      (on
                        ? "bg-foreground text-background"
                        : "border border-border text-muted-foreground hover:border-border/80")
                    }
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              title="Next thread (Alt+→)"
              aria-label="Next thread"
              onClick={() => {
                const id = adjacentThreadId(threads, activeThread?.id, 1);
                if (id) setSelectedThreadId(id);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <ConversationFeed
        earlierMessages={earlier}
        todayMessages={today}
        foldable
        expandedMap={messageExpanded}
        defaultExpanded={(msg) => todayIds.has(msg.id)}
        onToggle={toggleMessage}
        getFoldKey={(msg) => messageFoldKey(threadId, msg.id)}
        bottomSlot={draftSlot}
      />
    </div>
  );
}
