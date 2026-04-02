import { useNavigate } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useTasks } from "../../../hooks/useTasks";
import { useUpcomingWeddings } from "../../../hooks/useUpcomingWeddings";
import { useTodayMode } from "./TodayModeContext";

function formatStageLabel(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMiniDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function TodayInspector() {
  const { selection } = useTodayMode();
  const navigate = useNavigate();
  const { photographerId } = useAuth();
  const { drafts } = usePendingApprovals();
  const { unfiledThreads } = useUnfiledInbox();
  const { tasks } = useTasks();
  const { weddings, isLoading } = useUpcomingWeddings(photographerId ?? "", 6);

  const draft = selection.type === "draft" ? drafts.find((d) => d.id === selection.id) : undefined;
  const unfiled =
    selection.type === "unfiled" ? unfiledThreads.find((t) => t.id === selection.id) : undefined;
  const task = selection.type === "task" ? tasks.find((t) => t.id === selection.id) : undefined;

  if (selection.type === "overview") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-background p-4 text-[13px] text-foreground">
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h3>
        {isLoading ? (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        ) : weddings.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No upcoming weddings</p>
        ) : (
          <ul className="space-y-2">
            {weddings.map((w) => (
              <li
                key={w.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/pipeline/${w.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/pipeline/${w.id}`)}
                className="flex cursor-pointer items-start justify-between gap-2 rounded-md border border-border bg-sidebar/40 px-2.5 py-2 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">{w.couple_names}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3 shrink-0 opacity-70" strokeWidth={1.5} />
                    {formatMiniDate(w.wedding_date)}
                  </p>
                </div>
                <span className="shrink-0 rounded border border-border px-1.5 py-0 text-[11px] text-muted-foreground">
                  {formatStageLabel(w.stage)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (selection.type === "draft") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-background p-4 text-[13px] text-foreground">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Wedding context
        </h3>
        {draft ? (
          <p className="text-[13px] leading-snug">{draft.couple_names}</p>
        ) : (
          <p className="text-[12px] text-muted-foreground">No draft selected</p>
        )}
      </div>
    );
  }

  if (selection.type === "unfiled") {
    const meta = unfiled?.ai_routing_metadata;
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-background p-4 text-[13px] text-foreground">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          AI suggestion
        </h3>
        {!unfiled ? (
          <p className="text-[12px] text-muted-foreground">Thread not found</p>
        ) : !meta ? (
          <p className="text-[12px] text-muted-foreground">No AI routing metadata for this thread</p>
        ) : (
          <div className="space-y-2 text-[12px]">
            <p>
              <span className="text-muted-foreground">Intent:</span> {meta.classified_intent}
            </p>
            <p>
              <span className="text-muted-foreground">Confidence:</span>{" "}
              {Math.round(meta.confidence_score * 100)}%
            </p>
            <p className="leading-relaxed text-foreground">
              <span className="text-muted-foreground">Reasoning:</span> {meta.reasoning}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (selection.type === "task") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-background p-4 text-[13px] text-foreground">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Related wedding
        </h3>
        {task?.couple_names ? (
          <p className="text-[13px]">{task.couple_names}</p>
        ) : (
          <p className="text-[12px] text-muted-foreground">No linked wedding</p>
        )}
      </div>
    );
  }

  return null;
}
