import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useWeddings } from "../../../hooks/useWeddings";
import { useInboxMode } from "./InboxModeContext";

const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
const ACTIVE_STAGES = new Set(["booked", "prep"]);

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function truncate(s: string, max: number) {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function InboxContextList() {
  const { selection, selectThread, selectProject } = useInboxMode();
  const { unfiledThreads, isLoading: threadsLoading } = useUnfiledInbox();
  const { photographerId } = useAuth();
  const { data: weddings, isLoading: weddingsLoading } = useWeddings(photographerId ?? "");
  const [query, setQuery] = useState("");

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return unfiledThreads;
    return unfiledThreads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.sender.toLowerCase().includes(q) ||
        t.snippet.toLowerCase().includes(q),
    );
  }, [unfiledThreads, query]);

  const inquiries = useMemo(
    () => weddings.filter((w) => INQUIRY_STAGES.has(w.stage)),
    [weddings],
  );

  const active = useMemo(
    () => weddings.filter((w) => ACTIVE_STAGES.has(w.stage)),
    [weddings],
  );

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar text-[13px] text-foreground">
      <div className="shrink-0 p-2 pb-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="w-full rounded-md border border-border bg-background pl-8 pr-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Search messages"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {/* UNFILED */}
        <div className="mb-6">
          <div className="mb-1 px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unfiled
            {!threadsLoading && filteredThreads.length > 0 && (
              <span className="ml-1.5 rounded border border-border bg-background px-1.5 py-0 text-[10px] tabular-nums">
                {filteredThreads.length}
              </span>
            )}
          </div>

          {threadsLoading ? (
            <p className="px-3 py-3 text-[12px] text-muted-foreground">Loading…</p>
          ) : filteredThreads.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-muted-foreground">No unfiled threads</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredThreads.map((t) => {
                const isSelected = selection.kind === "thread" && selection.thread.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => selectThread(t)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-md px-3 py-2.5 text-left transition-colors",
                        isSelected ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
                          {t.sender || "Unknown sender"}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatTimeAgo(t.last_activity_at)}
                        </span>
                      </div>
                      <span className="text-[12px] font-medium text-foreground">
                        {truncate(t.title, 36)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {truncate(t.snippet || "No preview", 55)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* PROJECTS */}
        <div className="mb-6">
          <div className="mb-1 px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inquiries
          </div>
          {weddingsLoading ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
          ) : inquiries.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">No inquiries</p>
          ) : (
            <ul className="space-y-0.5">
              {inquiries.map((w) => (
                <ProjectRow
                  key={w.id}
                  id={w.id}
                  name={w.couple_names}
                  isSelected={selection.kind === "project" && selection.projectId === w.id}
                  onSelect={() => selectProject(w.id, w.couple_names)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="mb-6">
          <div className="mb-1 px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Active Weddings
          </div>
          {weddingsLoading ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
          ) : active.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">No active weddings</p>
          ) : (
            <ul className="space-y-0.5">
              {active.map((w) => (
                <ProjectRow
                  key={w.id}
                  id={w.id}
                  name={w.couple_names}
                  isSelected={selection.kind === "project" && selection.projectId === w.id}
                  onSelect={() => selectProject(w.id, w.couple_names)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  id,
  name,
  isSelected,
  onSelect,
}: {
  id: string;
  name: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
          isSelected ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50",
        )}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/10 text-[10px] font-semibold text-[#2563eb]">
          {name.charAt(0)}
        </div>
        <span className="min-w-0 truncate text-[12px] font-medium">{name}</span>
      </button>
    </li>
  );
}
