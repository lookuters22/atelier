import { ChevronDown } from "lucide-react";
import {
  messageFoldKey,
  type WeddingThread,
  type WeddingThreadMessage,
} from "../../data/weddingThreads";
import { FoldableTimelineMessage } from "./FoldableTimelineMessage";

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
  editDraftInComposer: () => void;
  draftDefault: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(250,251,252,1)_0%,rgba(244,246,249,1)_100%)]">
      <div className="shrink-0 space-y-2 border-b border-border/60 bg-surface/80 px-4 py-2.5 backdrop-blur-sm">
        <div className="text-center">
          <p className="text-[12px] font-semibold text-ink">{activeThread?.title ?? "Thread"}</p>
          {activeThread?.participantHint ? (
            <p className="mt-0.5 text-[11px] text-ink-faint">{activeThread.participantHint}</p>
          ) : null}
        </div>
        {threads.length > 1 ? (
          <div className="flex flex-wrap justify-center gap-1.5">
            {threads.map((t) => {
              const on = t.id === activeThread?.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedThreadId(t.id)}
                  className={
                    "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
                    (on ? "bg-ink text-canvas" : "bg-canvas text-ink-muted hover:bg-black/[0.04]")
                  }
                >
                  {t.title}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        <div className="w-full space-y-2">
          {activeThread
            ? earlierMessages.map((msg) => {
                const fk = messageFoldKey(activeThread.id, msg.id);
                return (
                  <FoldableTimelineMessage
                    key={fk}
                    msg={msg}
                    expanded={messageExpanded[fk] ?? defaultExpandedForMessage(msg)}
                    onToggle={() => toggleMessage(fk)}
                  />
                );
              })
            : null}

          {todayMessages.length > 0 ? (
            <div className="flex justify-center py-0.5">
              <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Today
              </span>
            </div>
          ) : null}

          {activeThread
            ? todayMessages.map((msg) => {
                const fk = messageFoldKey(activeThread.id, msg.id);
                return (
                  <FoldableTimelineMessage
                    key={fk}
                    msg={msg}
                    expanded={messageExpanded[fk] ?? defaultExpandedForMessage(msg)}
                    onToggle={() => toggleMessage(fk)}
                  />
                );
              })
            : null}

          {showDraft ? (
            <div className="relative w-full rounded-lg bg-accent/[0.06]">
              {/* Pixel-based rect (no viewBox stretch) so rx matches rounded-lg (~8px) */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                height="100%"
                className="pointer-events-none absolute inset-0 text-accent"
                aria-hidden
              >
                <rect
                  x="1"
                  y="1"
                  width="calc(100% - 2px)"
                  height="calc(100% - 2px)"
                  rx={7}
                  ry={7}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  className="pending-draft-border-dash"
                />
              </svg>
              <button
                type="button"
                onClick={toggleDraftExpanded}
                aria-expanded={draftExpanded}
                className="relative z-[1] flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-black/[0.02]"
              >
                <ChevronDown
                  className={"mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition " + (draftExpanded ? "rotate-180" : "")}
                  strokeWidth={2}
                  aria-hidden
                />
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar text-[10px] font-bold text-white" aria-hidden>
                  ED
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">You</span>
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">Pending approval</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-faint">Draft Â· not sent yet</p>
                  {!draftExpanded ? (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink">{draftDefault}</p>
                  ) : null}
                </div>
              </button>
              {draftExpanded ? (
                <div className="relative z-[1] border-t border-border/60 px-3 pb-3 pt-0 sm:pl-[3.25rem]">
                  <p className="pt-2 text-[13px] leading-relaxed text-ink">{draftDefault}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        approveDraft();
                      }}
                    >
                      Approve & send
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-muted transition hover:border-accent/40 hover:text-ink"
                      onClick={(e) => {
                        e.stopPropagation();
                        editDraftInComposer();
                      }}
                    >
                      Edit in reply box
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="w-full rounded-lg border border-dashed border-border bg-surface/80 px-3 py-2 text-center text-[12px] text-ink-muted">
              No pending drafts for this thread. Use the reply box below.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
