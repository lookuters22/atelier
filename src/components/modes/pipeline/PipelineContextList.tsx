import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleTrigger,
  AnimatedCollapsibleContent,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAuth } from "@/context/AuthContext";
import { useWeddings } from "@/hooks/useWeddings";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "@/lib/pipelineWeddingListNavigation";
import { usePipelineMode } from "./PipelineModeContext";

const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
const ACTIVE_STAGES = new Set(["booked", "prep"]);
const DELIVERABLE_STAGES = new Set(["delivered", "final_balance"]);

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatStageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
}

function stageBadgeClass(stage: string): string {
  if (INQUIRY_STAGES.has(stage)) {
    return "border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100";
  }
  if (ACTIVE_STAGES.has(stage)) {
    return "border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (DELIVERABLE_STAGES.has(stage)) {
    return "border-violet-200/80 bg-violet-50 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-100";
  }
  if (stage === "archived") {
    return "border-border bg-muted/60 text-muted-foreground";
  }
  return "border-border bg-background text-foreground";
}

type Bucket = "inquiries" | "active" | "deliverables" | "archived";

const BUCKET_ORDER: Bucket[] = ["inquiries", "active", "deliverables", "archived"];

function bucketForStage(stage: string): Bucket {
  if (INQUIRY_STAGES.has(stage)) return "inquiries";
  if (ACTIVE_STAGES.has(stage)) return "active";
  if (DELIVERABLE_STAGES.has(stage)) return "deliverables";
  if (stage === "archived") return "archived";
  return "inquiries";
}

export function PipelineContextList() {
  const { photographerId } = useAuth();
  const { data: weddings, isLoading, error, deleteWedding } = useWeddings(photographerId ?? "");
  const { weddingId, selectWedding } = usePipelineMode();
  const [query, setQuery] = useState("");
  const listScrollRef = useRef<HTMLDivElement>(null);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await deleteWedding(id);
    if (weddingId === id) selectWedding(null as unknown as string);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return weddings;
    return weddings.filter((w) => w.couple_names.toLowerCase().includes(q));
  }, [weddings, query]);

  const buckets = useMemo(() => {
    const out: Record<Bucket, typeof weddings> = {
      inquiries: [],
      active: [],
      deliverables: [],
      archived: [],
    };
    for (const w of filtered) {
      out[bucketForStage(w.stage)].push(w);
    }
    return out;
  }, [filtered]);

  /** Same order as sidebar sections: inquiries → active → deliverables → archived. */
  const orderedWeddingIds = useMemo(() => {
    const ids: string[] = [];
    for (const b of BUCKET_ORDER) {
      for (const w of buckets[b]) {
        ids.push(w.id);
      }
    }
    return ids;
  }, [buckets]);

  const goPrevWedding = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedWeddingIds, weddingId, -1);
    if (id && id !== weddingId) selectWedding(id);
  }, [orderedWeddingIds, weddingId, selectWedding]);

  const goNextWedding = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedWeddingIds, weddingId, 1);
    if (id && id !== weddingId) selectWedding(id);
  }, [orderedWeddingIds, weddingId, selectWedding]);

  useEffect(() => {
    if (orderedWeddingIds.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentWeddingIdInOrderedList(orderedWeddingIds, weddingId, delta);
      if (!id || id === weddingId) return;
      e.preventDefault();
      e.stopPropagation();
      selectWedding(id);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedWeddingIds, weddingId, selectWedding]);

  useLayoutEffect(() => {
    if (!weddingId) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-pipeline-wedding-row="${CSS.escape(weddingId)}"]`);
    if (!(el instanceof HTMLElement)) return;
    scrollPipelineWeddingRowIntoView(el);
  }, [weddingId, orderedWeddingIds]);

  const queuePosition = useMemo(
    () => weddingQueuePosition(orderedWeddingIds, weddingId),
    [orderedWeddingIds, weddingId],
  );

  const sections: { id: Bucket; title: string }[] = [
    { id: "inquiries", title: "Inquiries" },
    { id: "active", title: "Active Bookings" },
    { id: "deliverables", title: "Deliverables" },
    { id: "archived", title: "Archived" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar text-[13px]">
      <div className="shrink-0 space-y-2 p-3 pb-4">
        <Input
          type="search"
          placeholder="Search couples…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 border-border bg-background text-[13px] placeholder:text-[12px]"
        />
        {!isLoading && !error && orderedWeddingIds.length >= 2 ? (
          <div
            role="region"
            aria-label="Pipeline wedding queue navigation"
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/80 px-2 py-1.5"
          >
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-muted-foreground">Queue</span>
              {queuePosition ? (
                <span className="ml-1.5 tabular-nums text-[11px] text-muted-foreground" aria-live="polite">
                  {queuePosition.current} / {queuePosition.total}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Previous wedding (Alt+↑)"
                aria-label="Previous wedding in queue"
                onClick={goPrevWedding}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Next wedding (Alt+↓)"
                aria-label="Next wedding in queue"
                onClick={goNextWedding}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
        <Button variant="outline" size="sm" className="h-8 w-full border-slate-200 text-slate-900 hover:bg-slate-100 hover:text-slate-900 text-[12px]" asChild>
          <Link to="/weddings/new">
            <Plus className="size-3.5" strokeWidth={2} />
            Add wedding
          </Link>
        </Button>
      </div>

      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && (
          <p className="px-2 py-3 text-[12px] text-muted-foreground">Loading weddings…</p>
        )}
        {error && (
          <p className="px-2 py-3 text-[12px] text-destructive">Error: {error}</p>
        )}
        {!isLoading && !error && (
          <div className="space-y-1">
            {sections.map(({ id, title }) => (
              <Collapsible key={id} defaultOpen>
                <CollapsibleTrigger
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-foreground",
                    "hover:bg-accent/50 data-[state=open]:bg-accent/30 [&[data-state=open]_svg]:rotate-180"
                  )}
                >
                  <span>
                    {title}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({buckets[id].length})
                    </span>
                  </span>
                  <ChevronDown
                    className="size-3.5 shrink-0 text-muted-foreground transition-transform"
                    strokeWidth={2}
                  />
                </CollapsibleTrigger>
                <AnimatedCollapsibleContent>
                  <div className="space-y-0.5 pb-2 pl-1 pt-0.5">
                    {id === "archived" && buckets[id].length === 0 ? (
                      <p className="px-2 py-2 text-[12px] text-muted-foreground">
                        No archived weddings yet.
                      </p>
                    ) : (
                      buckets[id].map((w) => {
                        const selected = weddingId === w.id;
                        return (
                          <ContextMenu key={w.id}>
                            <ContextMenuTrigger asChild>
                              <button
                                type="button"
                                data-pipeline-wedding-row={w.id}
                                onClick={() => selectWedding(w.id)}
                                className={cn(
                                  "flex w-full flex-col gap-1 rounded-md border border-transparent px-2 py-2 text-left transition-colors",
                                  "hover:border-border hover:bg-background/80",
                                  selected && "border-border bg-accent"
                                )}
                              >
                                <span className="font-medium leading-tight text-foreground">
                                  {w.couple_names}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex max-w-full truncate rounded-full border px-1.5 py-0.5 text-[11px] font-medium capitalize",
                                      stageBadgeClass(w.stage)
                                    )}
                                  >
                                    {formatStageLabel(w.stage)}
                                  </span>
                                  <span className="text-[12px] text-muted-foreground">
                                    {formatShortDate(w.wedding_date)}
                                  </span>
                                </div>
                              </button>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => selectWedding(w.id)}>
                                <ExternalLink className="mr-1.5 h-3 w-3" />
                                Open project
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                variant="destructive"
                                onClick={() => handleDelete(w.id, w.couple_names)}
                              >
                                <Trash2 className="mr-1.5 h-3 w-3" />
                                Delete project
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })
                    )}
                  </div>
                </AnimatedCollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
