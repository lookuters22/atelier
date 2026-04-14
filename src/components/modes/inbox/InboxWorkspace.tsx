import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { EscalationResolutionPanel } from "../../escalations/EscalationResolutionPanel";
import { MessageSquare } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { fetchGmailImportHtmlForDisplay } from "../../../lib/gmailImportMessageMetadata";
import {
  INBOX_DRAFT_THREAD_NOT_ON_TIMELINE_MESSAGE,
  resolvePendingThreadHandoff,
} from "../../../lib/inboxDraftDeepLink";
import { useInboxMode } from "./InboxModeContext";
import {
  PipelineTimelinePane,
  PipelineWeddingProviderByWeddingId,
  usePipelineWedding,
} from "../pipeline/PipelineWeddingContext";
import { ConversationFeed, type ChatMessage } from "../../chat/ConversationFeed";
import { UniversalComposeBox } from "../../chat/ComposeBar";

export function InboxWorkspace() {
  const { selection, inboxUrlNotice, setInboxUrlNotice } = useInboxMode();
  const [searchParams] = useSearchParams();
  const preferredTimelineThreadId =
    searchParams.get("action") === "review_draft" ? searchParams.get("threadId") : null;

  const shell = (body: ReactNode) => (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {inboxUrlNotice ? (
        <div
          role="status"
          className="shrink-0 border-b border-amber-200/90 bg-amber-50 px-4 py-2.5 text-[12px] leading-snug text-amber-950"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{inboxUrlNotice}</span>
            <button
              type="button"
              className="shrink-0 text-[12px] font-medium text-amber-900 underline underline-offset-2"
              onClick={() => setInboxUrlNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
    </div>
  );

  if (selection.kind === "none") return shell(<IdleState />);
  if (selection.kind === "thread") return shell(<ThreadView />);
  return shell(
    <PipelineWeddingProviderByWeddingId
      weddingId={selection.projectId}
      preferredTimelineThreadId={preferredTimelineThreadId}
    >
      <InboxProjectPipelineChat />
    </PipelineWeddingProviderByWeddingId>,
  );
}

/** Matches Pipeline center pane: tabs, TimelineTab, draft approval, inline reply, composer modal. */
function InboxProjectPipelineChat() {
  const { pendingInboxPipelineThreadId, setPendingInboxPipelineThreadId, setInboxUrlNotice } = useInboxMode();
  const state = usePipelineWedding();

  /** Layout phase so target thread wins before `useWeddingThreads`’s effect can default to `threads[0]`. */
  useLayoutEffect(() => {
    if (!state || !pendingInboxPipelineThreadId) return;
    const { threadState } = state;
    const timelineIds = threadState.threads.map((t) => t.id);
    const outcome = resolvePendingThreadHandoff(pendingInboxPipelineThreadId, timelineIds);
    if (!outcome) {
      setPendingInboxPipelineThreadId(null);
      return;
    }
    if (outcome.kind === "abandon_with_notice") {
      setInboxUrlNotice(INBOX_DRAFT_THREAD_NOT_ON_TIMELINE_MESSAGE);
      setPendingInboxPipelineThreadId(null);
      return;
    }
    threadState.setSelectedThreadId(outcome.threadId);
    setPendingInboxPipelineThreadId(null);
  }, [state, pendingInboxPipelineThreadId, setPendingInboxPipelineThreadId, setInboxUrlNotice]);

  if (!state) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <span className="text-[13px] text-muted-foreground">Loading wedding…</span>
      </div>
    );
  }
  return <PipelineTimelinePane />;
}

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-8 text-center">
      <MessageSquare className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
      <p className="mt-3 max-w-[220px] text-[13px] leading-relaxed text-muted-foreground">
        Select a conversation or project to view messages.
      </p>
    </div>
  );
}

function ThreadView() {
  const { selection } = useInboxMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const escalationId = searchParams.get("escalationId");
  const [reply, setReply] = useState("");
  const [lazyHtml, setLazyHtml] = useState<string | null>(null);

  if (selection.kind !== "thread") return null;
  const thread = selection.thread;

  useEffect(() => {
    setLazyHtml(null);
    if (thread.latestMessageHtmlSanitized || !thread.gmailRenderHtmlRef) return;
    let cancelled = false;
    void fetchGmailImportHtmlForDisplay(supabase, thread.gmailRenderHtmlRef).then((html) => {
      if (!cancelled && html) setLazyHtml(html);
    });
    return () => {
      cancelled = true;
    };
  }, [thread.id, thread.latestMessageHtmlSanitized, thread.gmailRenderHtmlRef]);

  const bodyHtml = thread.latestMessageHtmlSanitized ?? lazyHtml;

  const earlier: ChatMessage[] = useMemo(
    () => [
      {
        id: thread.latestMessageId ?? thread.id,
        direction: "in" as const,
        sender: thread.sender || "Unknown",
        body: thread.latestMessageBody?.trim() || thread.snippet || "No message content available.",
        bodyHtmlSanitized: bodyHtml,
        attachments:
          thread.latestMessageAttachments.length > 0 ? thread.latestMessageAttachments : undefined,
        time: "Received",
      },
    ],
    [thread, bodyHtml],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 px-6 py-5 min-h-[88px] flex flex-col justify-center">
        <h2 className="text-lg font-semibold text-foreground">{thread.title}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {thread.sender || "Unknown sender"}
        </p>
      </div>

      <ConversationFeed
        earlierMessages={earlier}
        todayMessages={[]}
        emptyText="No message content available."
      />

      {thread.ai_routing_metadata && (
        <div className="mx-5 mb-2 rounded-lg border border-border bg-accent/50 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            AI Routing
          </p>
          <p className="text-[12px] text-muted-foreground">
            Intent: {thread.ai_routing_metadata.classified_intent} &middot;{" "}
            {Math.round(thread.ai_routing_metadata.confidence_score * 100)}% confidence
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {thread.ai_routing_metadata.reasoning}
          </p>
        </div>
      )}

      {escalationId ? (
        <div className="mx-5 mb-3 shrink-0">
          <EscalationResolutionPanel
            escalationId={escalationId}
            onResolved={() => {
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("escalationId");
                  return next;
                },
                { replace: true },
              );
            }}
          />
        </div>
      ) : null}

      <UniversalComposeBox value={reply} onChange={setReply} placeholder="Reply to thread\u2026" />
    </div>
  );
}
