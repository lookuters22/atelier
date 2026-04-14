import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useWeddings } from "../../../hooks/useWeddings";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "@/lib/pipelineWeddingListNavigation";
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
  const { inboxThreads, isLoading: threadsLoading, loadError: inboxLoadError } = useUnfiledInbox();
  const { photographerId, isLoading: authLoading } = useAuth();
  const { data: weddings, isLoading: weddingsLoading, error: weddingsError } = useWeddings(photographerId ?? "");
  const [query, setQuery] = useState("");
  const threadListScrollRef = useRef<HTMLDivElement>(null);

  const dataLoadError = [inboxLoadError, weddingsError].filter(Boolean).join(" · ") || null;

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inboxThreads;
    return inboxThreads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.sender.toLowerCase().includes(q) ||
        t.snippet.toLowerCase().includes(q),
    );
  }, [inboxThreads, query]);

  const orderedThreadIds = useMemo(() => filteredThreads.map((t) => t.id), [filteredThreads]);

  const selectedThreadId = selection.kind === "thread" ? selection.thread.id : null;

  const goPrevThread = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedThreadIds, selectedThreadId, -1);
    if (!id) return;
    const t = filteredThreads.find((x) => x.id === id);
    if (t) selectThread(t);
  }, [orderedThreadIds, selectedThreadId, filteredThreads, selectThread]);

  const goNextThread = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedThreadIds, selectedThreadId, 1);
    if (!id) return;
    const t = filteredThreads.find((x) => x.id === id);
    if (t) selectThread(t);
  }, [orderedThreadIds, selectedThreadId, filteredThreads, selectThread]);

  useEffect(() => {
    if (orderedThreadIds.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentWeddingIdInOrderedList(orderedThreadIds, selectedThreadId, delta);
      if (!id) return;
      const t = filteredThreads.find((x) => x.id === id);
      if (!t) return;
      if (id === selectedThreadId) return;
      e.preventDefault();
      e.stopPropagation();
      selectThread(t);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedThreadIds, selectedThreadId, filteredThreads, selectThread]);

  useLayoutEffect(() => {
    if (!selectedThreadId) return;
    const root = threadListScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-inbox-thread-row="${CSS.escape(selectedThreadId)}"]`);
    if (!(el instanceof HTMLElement)) return;
    scrollPipelineWeddingRowIntoView(el);
  }, [selectedThreadId, orderedThreadIds]);

  const threadQueuePosition = useMemo(
    () => weddingQueuePosition(orderedThreadIds, selectedThreadId),
    [orderedThreadIds, selectedThreadId],
  );

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
        {!threadsLoading && orderedThreadIds.length >= 2 ? (
          <div
            role="region"
            aria-label="Inbox thread queue navigation"
            className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-background/80 px-2 py-1.5"
          >
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-muted-foreground">Threads</span>
              {threadQueuePosition ? (
                <span className="ml-1.5 tabular-nums text-[11px] text-muted-foreground" aria-live="polite">
                  {threadQueuePosition.current} / {threadQueuePosition.total}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Previous thread (Alt+↑)"
                aria-label="Previous thread in inbox list"
                onClick={goPrevThread}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Next thread (Alt+↓)"
                aria-label="Next thread in inbox list"
                onClick={goNextThread}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div ref={threadListScrollRef} className="min-h-0 flex-1 overflow-y-auto px-1">
        {!authLoading && !photographerId ? (
          <div
            className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-950 dark:text-amber-100/95"
            role="alert"
          >
            <p className="font-medium">Not signed in</p>
            <p className="mt-1 text-[11px] opacity-90">
              Inbox loads threads and weddings for your photographer account. Sign in to see data.
            </p>
          </div>
        ) : null}
        {dataLoadError ? (
          <div
            className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300/95"
            role="alert"
          >
            <p className="font-medium">Could not load Inbox data</p>
            <p className="mt-1 font-mono text-[11px] leading-snug break-words">{dataLoadError}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Common causes: Supabase project missing migrations (e.g.{" "}
              <span className="font-mono">v_threads_inbox_latest_message</span>), wrong{" "}
              <span className="font-mono">VITE_SUPABASE_URL</span>, or signed in as a different user than the one used
              for imports. Check the browser console and Network tab for the failing request.
            </p>
          </div>
        ) : null}
        {/* INBOX */}
        <div className="mb-6">
          <div className="mb-1 px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inbox
            {!threadsLoading && filteredThreads.length > 0 && (
              <span className="ml-1.5 rounded border border-border bg-background px-1.5 py-0 text-[10px] tabular-nums">
                {filteredThreads.length}
              </span>
            )}
          </div>

          {threadsLoading ? (
            <p className="px-3 py-3 text-[12px] text-muted-foreground">Loading…</p>
          ) : filteredThreads.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-muted-foreground">No inbox threads</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredThreads.map((t) => {
                const isSelected = selection.kind === "thread" && selection.thread.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      data-inbox-thread-row={t.id}
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
  name,
  isSelected,
  onSelect,
}: {
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
