import type { ReactNode, RefObject } from "react";
import { FileText, Paperclip, Send, Sparkles } from "lucide-react";

interface UniversalComposeBoxProps {
  value: string;
  onChange: (v: string) => void;
  onSend?: () => void;
  placeholder?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onAttach?: () => void;
  onTemplate?: () => void;
  onAiRewrite?: () => void;
  isInternalNote?: boolean;
  metaSlot?: ReactNode;
}

export function UniversalComposeBox({
  value,
  onChange,
  onSend,
  placeholder = "Type a reply\u2026",
  textareaRef,
  onAttach,
  onTemplate,
  onAiRewrite,
  isInternalNote,
  metaSlot,
}: UniversalComposeBoxProps) {
  function handleSend() {
    if (!value.trim()) return;
    onSend?.();
  }

  return (
    <div className="shrink-0 px-5 pb-4 pt-2">
      <div className="rounded-xl border border-border bg-background p-3 shadow-sm focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-1 pt-0 pb-2 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cursor-pointer text-muted-foreground transition hover:text-foreground"
              onClick={onAttach}
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={
                "cursor-pointer transition " +
                (isInternalNote
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
              onClick={onTemplate}
              title="Templates / Notes"
            >
              <FileText className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="cursor-pointer text-muted-foreground transition hover:text-foreground"
              onClick={onAiRewrite}
              title="AI rewrite"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!value.trim()}
            className="cursor-pointer text-muted-foreground transition hover:text-[#2563eb] disabled:cursor-default disabled:opacity-30"
            title="Send"
          >
            <Send className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {metaSlot}
    </div>
  );
}

/** @deprecated Use UniversalComposeBox instead */
export const ComposeBar = UniversalComposeBox;
