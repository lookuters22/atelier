import { useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useInboxMode } from "./InboxModeContext";
import { useWeddingProject } from "../../../hooks/useWeddingProject";
import { ConversationFeed, type ChatMessage } from "../../chat/ConversationFeed";
import { UniversalComposeBox } from "../../chat/ComposeBar";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(iso)) {
    return `Today \u00b7 ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} \u00b7 ${time}`;
}

export function InboxWorkspace() {
  const { selection } = useInboxMode();

  if (selection.kind === "none") return <IdleState />;
  if (selection.kind === "thread") return <ThreadView />;
  return <ProjectFeed />;
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
  const [reply, setReply] = useState("");

  if (selection.kind !== "thread") return null;
  const thread = selection.thread;

  const earlier: ChatMessage[] = useMemo(
    () => [
      {
        id: thread.id,
        direction: "in" as const,
        sender: thread.sender || "Unknown",
        body: thread.snippet || "No message content available.",
        time: "Received",
      },
    ],
    [thread],
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

      <UniversalComposeBox value={reply} onChange={setReply} placeholder="Reply to thread\u2026" />
    </div>
  );
}

function ProjectFeed() {
  const { selection } = useInboxMode();
  const [reply, setReply] = useState("");

  const projectId = selection.kind === "project" ? selection.projectId : undefined;
  const projectName = selection.kind === "project" ? selection.projectName : "";
  const { timeline, isLoading } = useWeddingProject(projectId);

  const { earlier, today } = useMemo(() => {
    const allRaw: { id: string; direction: string; sender: string; body: string; sent_at: string }[] = [];

    for (const thread of timeline) {
      for (const msg of thread.messages) {
        allRaw.push(msg);
      }
    }

    allRaw.sort(
      (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
    );

    const mapMsg = (m: typeof allRaw[number]): ChatMessage => ({
      id: m.id,
      direction: m.direction === "internal" ? "out" : (m.direction as "in" | "out"),
      sender: m.sender,
      body: m.body,
      time: formatTime(m.sent_at),
    });

    return {
      earlier: allRaw.filter((m) => !isToday(m.sent_at)).map(mapMsg),
      today: allRaw.filter((m) => isToday(m.sent_at)).map(mapMsg),
    };
  }, [timeline]);

  if (selection.kind !== "project") return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 px-6 py-5 min-h-[88px] flex flex-col justify-center">
        <h2 className="text-lg font-semibold text-foreground">{projectName}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Project conversation feed</p>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px] text-muted-foreground">Loading messages\u2026</p>
        </div>
      ) : (
        <ConversationFeed
          earlierMessages={earlier}
          todayMessages={today}
          emptyText="No messages linked to this project yet."
        />
      )}

      <UniversalComposeBox value={reply} onChange={setReply} placeholder={`Message ${projectName}\u2026`} />
    </div>
  );
}
