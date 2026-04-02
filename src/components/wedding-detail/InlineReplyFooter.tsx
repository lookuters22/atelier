import type { Dispatch, RefObject, SetStateAction } from "react";
import { UniversalComposeBox } from "../chat/ComposeBar";
import type { ReplyMeta, ReplyScope } from "./types";

export function InlineReplyFooter({
  replyMeta,
  replyScope,
  applyReplyScope,
  replyAreaRef,
  replyBody,
  setReplyBody,
  submitInlineForApproval,
  isInternalNote,
  toggleInternalNote,
  generateInlineResponse,
  showToast,
}: {
  replyMeta: ReplyMeta;
  replyScope: ReplyScope;
  applyReplyScope: (scope: ReplyScope) => void;
  replyAreaRef: RefObject<HTMLTextAreaElement | null>;
  replyBody: string;
  setReplyBody: Dispatch<SetStateAction<string>>;
  submitInlineForApproval: () => void | Promise<void>;
  isInternalNote: boolean;
  toggleInternalNote: () => void;
  generateInlineResponse: () => void;
  showToast: (msg: string) => void;
}) {
  return (
    <UniversalComposeBox
      value={replyBody}
      onChange={setReplyBody}
      onSend={submitInlineForApproval}
      placeholder={isInternalNote ? "Write an internal note\u2026" : "Message\u2026"}
      textareaRef={replyAreaRef}
      onAttach={() => showToast("Attachment picker (demo).")}
      onTemplate={toggleInternalNote}
      onAiRewrite={generateInlineResponse}
      isInternalNote={isInternalNote}
      metaSlot={
        replyMeta.toAddr ? (
          <p className="mt-1.5 truncate px-1 text-[10px] text-muted-foreground">
            To {replyMeta.toAddr}
            {replyScope === "replyAll" ? " + Cc" : ""}
            <span className="opacity-40"> &middot; </span>
            <button
              type="button"
              onClick={() =>
                applyReplyScope(replyScope === "reply" ? "replyAll" : "reply")
              }
              className="font-semibold text-foreground hover:underline"
            >
              {replyScope === "reply" ? "Reply all" : "Reply only"}
            </button>
          </p>
        ) : null
      }
    />
  );
}
