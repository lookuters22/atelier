import { Paperclip } from "lucide-react";
import type { WeddingTravelPlan } from "../../data/weddingTravel";
import { getMessagesForThread, type WeddingThread } from "../../data/weddingThreads";
import { TravelTabPanel } from "../TravelTabPanel";
import { WeddingFinancialsPanel } from "../WeddingFinancialsPanel";
import type { ProjectTask } from "../../hooks/useWeddingProject";
import type { TabId } from "./types";

function formatTaskDue(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay.getTime() === todayStart.getTime()) return "Today";
  if (dueDay.getTime() < todayStart.getTime()) return "Overdue";
  return due.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function WeddingDetailTabContent({
  tab,
  threads,
  setSelectedThreadId,
  setTabAndUrl,
  showToast,
  weddingId,
  travelPlan,
  tasks = [],
}: {
  tab: TabId;
  threads: WeddingThread[];
  setSelectedThreadId: (threadId: string) => void;
  setTabAndUrl: (next: TabId) => void;
  showToast: (msg: string) => void;
  weddingId: string;
  travelPlan: WeddingTravelPlan | null;
  tasks?: ProjectTask[];
}) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
      {tab === "thread" ? (
        <div className="space-y-4">
          {threads.map((t) => {
            const count = getMessagesForThread(t.id).length;
            return (
              <div key={t.id}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.participantHint}</p>
                <div className="mt-2 space-y-3 rounded-2xl border border-border bg-canvas/60 p-4 text-[13px] text-ink-muted">
                  <p className="font-semibold text-ink">{t.title}</p>
                  <p>
                    {count} message{count === 1 ? "" : "s"} Â· last activity {t.lastActivityLabel}
                  </p>
                  <button
                    type="button"
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-link transition hover:border-link/40 hover:text-link-hover"
                    onClick={() => {
                      setSelectedThreadId(t.id);
                      setTabAndUrl("timeline");
                    }}
                  >
                    Open in timeline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "tasks" ? (
        <ul className="space-y-2 text-[13px]">
          {tasks.length > 0 ? (
            tasks.map((t) => (
              <li
                key={t.id}
                id={`wedding-task-${t.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <input type="checkbox" className="h-4 w-4 accent-link" />
                  <span>{t.title}</span>
                </div>
                <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-faint">{formatTaskDue(t.due_date)}</span>
              </li>
            ))
          ) : (
            <li className="rounded-xl border border-dashed border-border bg-canvas/40 px-3 py-4 text-center text-ink-muted">
              No open tasks for this wedding.
            </li>
          )}
        </ul>
      ) : null}

      {tab === "files" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2">
            <Paperclip className="h-4 w-4 text-ink-faint" />
            <div>
              <p className="text-[13px] font-semibold text-ink">timeline_v3.pdf</p>
              <p className="text-[12px] text-ink-faint">248 KB Â· from planner</p>
            </div>
          </div>
          <button
            type="button"
            className="text-[12px] font-semibold text-link hover:text-link-hover"
            onClick={() => showToast("Upload dialog would open here (demo).")}
          >
            + Add file
          </button>
        </div>
      ) : null}

      {tab === "financials" ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-muted">Proposals, contracts, and invoices for this wedding.</p>
          <WeddingFinancialsPanel weddingId={weddingId} />
        </div>
      ) : null}

      {tab === "travel" ? (
        <div className="space-y-5">
          {travelPlan ? (
            <TravelTabPanel travelPlan={travelPlan} onToast={showToast} />
          ) : (
            <p className="text-[13px] text-ink-muted">No travel plan for this wedding (demo).</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
