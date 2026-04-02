import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useTasks } from "../../../hooks/useTasks";
import { useTodayMode } from "./TodayModeContext";

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function formatDuePill(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function TodayContextList() {
  const { selection, select } = useTodayMode();
  const { drafts, isLoading: draftsLoading } = usePendingApprovals();
  const { unfiledThreads, isLoading: unfiledLoading } = useUnfiledInbox();
  const { tasks, isLoading: tasksLoading } = useTasks();

  const [openDrafts, setOpenDrafts] = useState(true);
  const [openUnfiled, setOpenUnfiled] = useState(true);
  const [openTasks, setOpenTasks] = useState(true);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar text-[13px] text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Drafts */}
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setOpenDrafts((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                openDrafts && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="font-medium">Drafts</span>
            <span className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[11px] text-muted-foreground tabular-nums">
              {draftsLoading ? "—" : drafts.length}
            </span>
          </button>
          {openDrafts && (
            <ul className="pb-2">
              {draftsLoading ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</li>
              ) : drafts.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">No drafts</li>
              ) : (
                drafts.map((d) => {
                  const isSel = selection.type === "draft" && selection.id === d.id;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => select({ type: "draft", id: d.id })}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                          isSel ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="text-[12px] font-medium text-foreground">{truncate(d.couple_names, 28)}</span>
                        <span className="text-[12px] text-muted-foreground">{truncate(d.thread_title, 42)}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* Unfiled */}
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setOpenUnfiled((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                openUnfiled && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="font-medium">Unfiled</span>
            <span className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[11px] text-muted-foreground tabular-nums">
              {unfiledLoading ? "—" : unfiledThreads.length}
            </span>
          </button>
          {openUnfiled && (
            <ul className="pb-2">
              {unfiledLoading ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</li>
              ) : unfiledThreads.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Inbox clear</li>
              ) : (
                unfiledThreads.map((t) => {
                  const isSel = selection.type === "unfiled" && selection.id === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => select({ type: "unfiled", id: t.id })}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                          isSel ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="text-[12px] text-foreground">{truncate(t.title, 44)}</span>
                        <span className="text-[12px] text-muted-foreground">{truncate(t.sender || "Unknown sender", 36)}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* Tasks */}
        <div>
          <button
            type="button"
            onClick={() => setOpenTasks((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                openTasks && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="font-medium">Tasks</span>
            <span className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[11px] text-muted-foreground tabular-nums">
              {tasksLoading ? "—" : tasks.length}
            </span>
          </button>
          {openTasks && (
            <ul className="pb-2">
              {tasksLoading ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</li>
              ) : tasks.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">No open tasks</li>
              ) : (
                tasks.map((task) => {
                  const isSel = selection.type === "task" && selection.id === task.id;
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => select({ type: "task", id: task.id })}
                        className={cn(
                          "flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors",
                          isSel ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="min-w-0 flex-1 text-[12px] text-foreground">{truncate(task.title, 40)}</span>
                        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                          {formatDuePill(task.due_date)}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
