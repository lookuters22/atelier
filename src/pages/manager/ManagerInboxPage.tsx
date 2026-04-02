import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Filter } from "lucide-react";
import { useManagerContext } from "../../context/ManagerContext";
import {
  MANAGER_FOCUS_FILTERS,
  MANAGER_INBOX_ROWS,
  MANAGER_QUICK_FILTERS,
  type ManagerInboxFilterId,
  type ManagerInboxRow,
  managerRowMatches,
} from "../../data/managerInbox";

function filterLabel(filter: ManagerInboxFilterId): string {
  const focus = MANAGER_FOCUS_FILTERS.find((x) => x.id === filter);
  if (focus) return focus.label;
  const q = MANAGER_QUICK_FILTERS.find((x) => x.id === filter);
  return q?.label ?? "All messages";
}

function rowMatchesWithSelection(row: ManagerInboxRow, filter: ManagerInboxFilterId, selectedId: string): boolean {
  if (!managerRowMatches(row, filter)) return false;
  if (selectedId === "all") return true;
  return row.photographerId === selectedId;
}

export function ManagerInboxPage() {
  const { selectedId } = useManagerContext();
  const [searchParams] = useSearchParams();
  const initialFilter = (searchParams.get("filter") as ManagerInboxFilterId | null) ?? "inquiries";

  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ManagerInboxFilterId>(
    MANAGER_QUICK_FILTERS.some((q) => q.id === initialFilter) || MANAGER_FOCUS_FILTERS.some((f) => f.id === initialFilter)
      ? initialFilter
      : "inquiries",
  );
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  const visible = useMemo(
    () => MANAGER_INBOX_ROWS.filter((r) => rowMatchesWithSelection(r, activeFilter, selectedId)),
    [activeFilter, selectedId],
  );

  const selectFilter = (id: ManagerInboxFilterId) => {
    setActiveFilter(id);
    setFilterOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Inbox</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
            Triage across every wedding. Threads are filtered by the selected photographer when not viewing all.
          </p>
        </div>
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            aria-expanded={filterOpen}
            aria-haspopup="listbox"
            className={
              "inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-2 text-[13px] transition " +
              (activeFilter !== "all"
                ? "border-ink/10 text-ink"
                : "border-border text-ink-muted hover:border-ink/15 hover:text-ink")
            }
            onClick={() => setFilterOpen((o) => !o)}
          >
            <Filter className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              {activeFilter === "all" ? "Filters" : filterLabel(activeFilter)}
            </span>
            {activeFilter !== "all" ? (
              <span className="rounded-full bg-border/50 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                Active
              </span>
            ) : null}
            <ChevronDown
              className={"h-4 w-4 shrink-0 opacity-60 transition " + (filterOpen ? "rotate-180" : "")}
              strokeWidth={1.75}
            />
          </button>

          {filterOpen ? (
            <div
              className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(100vw-2rem,20rem)] rounded-lg border border-border/90 bg-surface py-2"
              role="listbox"
            >
              <div className="border-b border-border/70 px-3 pb-2 pt-1">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Focus
                </p>
                <div className="flex flex-col gap-1">
                  {MANAGER_FOCUS_FILTERS.map(({ id, label, Icon }) => {
                    const on = activeFilter === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        className={
                          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition " +
                          (on
                            ? "bg-canvas text-ink ring-1 ring-ink/10"
                            : "text-ink-muted hover:bg-canvas/80 hover:text-ink")
                        }
                        onClick={() => selectFilter(id)}
                      >
                        <span
                          className={
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                            (on ? "bg-surface text-link" : "bg-canvas/90 text-ink-faint")
                          }
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-2 pt-2">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Quick filters
                </p>
                {MANAGER_QUICK_FILTERS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={activeFilter === o.id}
                    className={
                      "flex w-full rounded-lg px-2 py-2 text-left text-[13px] transition " +
                      (activeFilter === o.id
                        ? "bg-canvas font-semibold text-ink ring-1 ring-ink/8"
                        : "text-ink-muted hover:bg-canvas/70 hover:text-ink")
                    }
                    onClick={() => selectFilter(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-canvas/40 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-ink">No threads in this view</p>
          <p className="mt-2 text-[13px] text-ink-muted">
            Try another filter, switch to <strong className="text-ink">All photographers</strong>, or open{" "}
            <strong className="text-ink">Inquiries</strong>.
          </p>
          <button
            type="button"
            className="mt-4 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-white/[0.12]"
            onClick={() => setActiveFilter("inquiries")}
          >
            Show inquiries
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-ink">{row.wedding}</p>
                    {row.badges.map((b) => (
                      <span
                        key={b}
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
                          (b === "Inquiry"
                            ? "bg-link/15 text-link"
                            : "border border-border px-2.5 text-ink-muted")
                        }
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[15px] font-semibold text-ink">{row.subject}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{row.snippet}</p>
                  {row.confidence ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-[12px] text-ink-muted">
                      <span className="font-semibold text-ink">{row.confidence.pct}% match</span>
                      <span>· {row.confidence.label}</span>
                      <button type="button" className="font-semibold text-link hover:text-link-hover">
                        Confirm
                      </button>
                      <button type="button" className="font-semibold text-ink-muted hover:text-ink">
                        Choose wedding
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-3">
                  <span className="text-[12px] text-ink-faint">{row.time}</span>
                  {row.weddingId ? (
                    <Link
                      to={`/manager/wedding/${row.weddingId}`}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:text-link-hover"
                    >
                      Open wedding
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:text-link-hover"
                    >
                      Link thread
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
