import { ChevronDown } from "lucide-react";
import type { WeddingThreadMessage } from "../../data/weddingThreads";

function senderInitials(sender: string): string {
  const parts = sender.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

/** Full-width row; click header to fold/unfold body */
export function FoldableTimelineMessage({
  msg,
  expanded,
  onToggle,
}: {
  msg: WeddingThreadMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  const incoming = msg.direction === "in";
  const initials = incoming ? senderInitials(msg.sender) : "ED";

  return (
    <article
      className={
        "w-full rounded-lg border text-[13px] " +
        (incoming
          ? "border-border/80 bg-surface"
          : "border-border/80 bg-accent/[0.06]")
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-black/[0.025]"
      >
        <ChevronDown
          className={"mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition " + (expanded ? "rotate-180" : "")}
          strokeWidth={2}
          aria-hidden
        />
        <div
          className={
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
            (incoming ? "border border-border/80 bg-canvas text-ink-muted" : "bg-sidebar text-white")
          }
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
            <span className="font-semibold text-ink">{msg.sender}</span>
            <time className="shrink-0 text-[11px] tabular-nums text-ink-faint">{msg.time}</time>
          </div>
          {msg.subject ? (
            <p className="mt-0.5 text-[12px] font-semibold leading-snug text-ink-muted">{msg.subject}</p>
          ) : null}
          {!expanded ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink">{msg.body}</p>
          ) : null}
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-border/60 px-3 pb-3 pt-2 sm:pl-[3.25rem]">
          {msg.meta ? <p className="text-[11px] text-ink-faint">{msg.meta}</p> : null}
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{msg.body}</p>
        </div>
      ) : null}
    </article>
  );
}
