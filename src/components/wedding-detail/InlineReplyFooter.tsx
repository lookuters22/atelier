import type { Dispatch, RefObject, SetStateAction } from "react";
import { Paperclip, Reply, ReplyAll, Sparkles } from "lucide-react";
import type { ReplyMeta, ReplyScope } from "./types";

export function InlineReplyFooter({
  replyMeta,
  replyScope,
  applyReplyScope,
  replyAreaRef,
  replyBody,
  setReplyBody,
  submitInlineForApproval,
  openInternalComposer,
  generateInlineResponse,
  showToast,
}: {
  replyMeta: ReplyMeta;
  replyScope: ReplyScope;
  applyReplyScope: (scope: ReplyScope) => void;
  replyAreaRef: RefObject<HTMLTextAreaElement | null>;
  replyBody: string;
  setReplyBody: Dispatch<SetStateAction<string>>;
  submitInlineForApproval: () => void;
  openInternalComposer: () => void;
  generateInlineResponse: () => void;
  showToast: (msg: string) => void;
}) {
  return (
    <footer className="shrink-0 border-t border-border bg-surface px-3 py-2 sm:px-4">
      <div className="mb-1.5 flex min-h-[1.5rem] flex-wrap items-center gap-x-2 gap-y-1">
        <p
          className="min-w-0 flex-1 truncate text-[10px] leading-tight text-ink-faint sm:text-[11px]"
          title={
            replyMeta.toAddr
              ? `${replyMeta.toAddr} Â· ${replyMeta.subjectLine}${replyScope === "replyAll" ? " Â· Cc (demo)" : ""}`
              : `${replyMeta.subjectLine} â€” add recipients under People`
          }
        >
          {replyMeta.toAddr ? (
            <>
              <span className="font-medium text-ink-muted">To</span> {replyMeta.toAddr}
              <span className="text-ink-faint"> Â· </span>
            </>
          ) : (
            <span className="text-ink-faint">No recipient yet â€” </span>
          )}
          <span className="text-ink-muted">{replyMeta.subjectLine}</span>
          {replyScope === "replyAll" && replyMeta.toAddr ? (
            <span className="text-ink-faint"> Â· Cc +2</span>
          ) : null}
        </p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => applyReplyScope("reply")}
            title="Reply to sender only"
            className={
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition sm:text-[11px] " +
              (replyScope === "reply"
                ? "bg-ink text-canvas"
                : "border border-border bg-canvas text-ink-muted hover:border-accent/30")
            }
          >
            <Reply className="h-3 w-3" strokeWidth={2} aria-hidden />
            Reply
          </button>
          <button
            type="button"
            onClick={() => applyReplyScope("replyAll")}
            title="Reply all (demo: adds couple on Cc)"
            className={
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition sm:text-[11px] " +
              (replyScope === "replyAll"
                ? "bg-ink text-canvas"
                : "border border-border bg-canvas text-ink-muted hover:border-accent/30")
            }
          >
            <ReplyAll className="h-3 w-3" strokeWidth={2} aria-hidden />
            All
          </button>
        </div>
      </div>
      <label className="sr-only" htmlFor="wedding-inline-reply">
        Write a reply
      </label>
      <textarea
        id="wedding-inline-reply"
        ref={replyAreaRef}
        value={replyBody}
        onChange={(e) => setReplyBody(e.target.value)}
        placeholder="Write a replyâ€¦"
        rows={2}
        className="w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] leading-snug text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/25"
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          title="Submits draft for approval when required"
          className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-accent-hover sm:text-[12px]"
          onClick={submitInlineForApproval}
        >
          Submit
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-canvas px-2.5 text-ink transition hover:border-accent/40"
          onClick={() => showToast("Attachment picker (demo).")}
          title="Attach file"
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="rounded-full border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink sm:text-[12px]"
          title="Studio-only note"
          onClick={openInternalComposer}
        >
          Note
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-canvas sm:text-[12px]"
          title="Draft a reply with AI (demo)"
          onClick={generateInlineResponse}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          Generate response
        </button>
      </div>
    </footer>
  );
}
