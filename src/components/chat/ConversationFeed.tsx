import { useEffect, useRef, type ReactNode } from "react";

export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  sender: string;
  body: string;
  time: string;
  meta?: string;
}

interface ConversationFeedProps {
  earlierMessages: ChatMessage[];
  todayMessages: ChatMessage[];
  foldable?: boolean;
  expandedMap?: Record<string, boolean>;
  defaultExpanded?: (msg: ChatMessage) => boolean;
  onToggle?: (key: string) => void;
  getFoldKey?: (msg: ChatMessage) => string;
  bottomSlot?: ReactNode;
  emptyText?: string;
}

function senderInitials(sender: string): string {
  const parts = sender.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function MessageBubble({
  msg,
  expanded,
  onToggle,
}: {
  msg: ChatMessage;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const incoming = msg.direction === "in";
  const initials = senderInitials(msg.sender);

  const content = expanded ? (
    <span className="whitespace-pre-wrap">{msg.body}</span>
  ) : (
    <span className="line-clamp-4">{msg.body}</span>
  );

  const bubbleClasses =
    "rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed transition " +
    (incoming
      ? "bg-accent text-foreground rounded-bl-md"
      : "border border-border bg-background text-foreground rounded-br-md");

  return (
    <div className={"flex gap-2.5 " + (incoming ? "justify-start" : "justify-end")}>
      {incoming && (
        <div
          className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-muted-foreground"
          title={msg.sender}
        >
          {initials}
        </div>
      )}
      <div className={"flex max-w-[75%] flex-col " + (incoming ? "items-start" : "items-end")}>
        {incoming && (
          <span className="mb-0.5 px-1 text-[10px] font-medium text-muted-foreground">
            {msg.sender}
          </span>
        )}
        {onToggle ? (
          <button type="button" onClick={onToggle} className={bubbleClasses}>
            {content}
          </button>
        ) : (
          <div className={bubbleClasses}>{content}</div>
        )}
        <time className="mt-0.5 px-1 text-[10px] tabular-nums text-muted-foreground">
          {msg.time}
        </time>
      </div>
      {!incoming && (
        <div
          className="mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background"
          title="You"
        >
          {initials}
        </div>
      )}
    </div>
  );
}

export function ConversationFeed({
  earlierMessages,
  todayMessages,
  foldable,
  expandedMap,
  defaultExpanded,
  onToggle,
  getFoldKey,
  bottomSlot,
  emptyText = "No messages yet.",
}: ConversationFeedProps) {
  const hasMessages = earlierMessages.length > 0 || todayMessages.length > 0;
  const endRef = useRef<HTMLDivElement>(null);
  const msgCount = earlierMessages.length + todayMessages.length;
  const prevCount = useRef(msgCount);

  useEffect(() => {
    if (!endRef.current) return;
    const isNewMessage = msgCount > prevCount.current;
    prevCount.current = msgCount;
    endRef.current.scrollIntoView({ behavior: isNewMessage ? "smooth" : "auto" });
  }, [msgCount, earlierMessages, todayMessages]);

  function renderMessage(msg: ChatMessage) {
    const key = getFoldKey ? getFoldKey(msg) : msg.id;
    const isExpanded = foldable
      ? (expandedMap?.[key] ?? defaultExpanded?.(msg) ?? true)
      : true;

    return (
      <MessageBubble
        key={msg.id}
        msg={msg}
        expanded={isExpanded}
        onToggle={foldable && onToggle ? () => onToggle(key) : undefined}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="flex w-full flex-col gap-3">
        {!hasMessages && !bottomSlot && (
          <p className="py-8 text-center text-[12px] text-muted-foreground">{emptyText}</p>
        )}

        {earlierMessages.map(renderMessage)}

        {todayMessages.length > 0 && (
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-accent px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Today
            </span>
          </div>
        )}

        {todayMessages.map(renderMessage)}

        {bottomSlot}
        <div ref={endRef} />
      </div>
    </div>
  );
}
