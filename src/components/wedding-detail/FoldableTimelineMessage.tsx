import type { WeddingThreadMessage } from "../../data/weddingThreads";

function senderInitials(sender: string): string {
  const parts = sender.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

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
    <div className={"flex gap-2 " + (incoming ? "justify-start" : "justify-end")}>
      {incoming && (
        <div
          className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-bold text-muted-foreground"
          title={msg.sender}
        >
          {initials}
        </div>
      )}

      <div className={"flex max-w-[75%] flex-col " + (incoming ? "items-start" : "items-end")}>
        {incoming && (
          <span className="mb-0.5 px-1 text-[10px] font-semibold text-ink-faint">{msg.sender}</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={
            "rounded-2xl px-3.5 py-2 text-left text-[13px] leading-snug transition " +
            (incoming
              ? "bg-surface text-ink rounded-bl-md"
              : "bg-link text-white rounded-br-md")
          }
        >
          {expanded ? (
            <span className="whitespace-pre-wrap">{msg.body}</span>
          ) : (
            <span className="line-clamp-4">{msg.body}</span>
          )}
        </button>
        <time className="mt-0.5 px-1 text-[10px] tabular-nums text-ink-faint">{msg.time}</time>
      </div>

      {!incoming && (
        <div
          className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-link text-[10px] font-bold text-white"
          title="You"
        >
          {initials}
        </div>
      )}
    </div>
  );
}
