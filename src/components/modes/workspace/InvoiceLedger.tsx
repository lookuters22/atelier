import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp, Plus, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "@/lib/pipelineWeddingListNavigation";
import { useWorkspaceMode } from "./WorkspaceModeContext";
import type { FinancialsOverviewRow } from "../../../data/weddingFinancials";

function fmtEur(n: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid") return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
  if (s === "sent" || s === "draft") return "border-amber-200/80 bg-amber-50 text-amber-900";
  if (s === "partial") return "border-sky-200/80 bg-sky-50 text-sky-900";
  if (s === "overdue") return "border-rose-200/80 bg-rose-50 text-rose-900";
  return "border-border bg-muted/60 text-muted-foreground";
}

function matchSearch(r: FinancialsOverviewRow, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    r.couple.toLowerCase().includes(s) ||
    r.title.toLowerCase().includes(s) ||
    r.status.toLowerCase().includes(s) ||
    (r.amountLabel?.toLowerCase().includes(s) ?? false)
  );
}

function invoiceRowQueueKey(r: FinancialsOverviewRow): string {
  return `${r.kind}-${r.id}`;
}

export function InvoiceLedger() {
  const { financialRows, financialStats, searchQuery, selectedRow, setSelectedRow, openNewInvoice } =
    useWorkspaceMode();

  const invoices = useMemo(
    () => financialRows.filter((r) => r.kind === "invoice").filter((r) => matchSearch(r, searchQuery)),
    [financialRows, searchQuery],
  );

  const listScrollRef = useRef<HTMLDivElement>(null);

  const orderedKeys = useMemo(() => invoices.map(invoiceRowQueueKey), [invoices]);

  const selectedKey = useMemo(() => {
    if (selectedRow?.kind !== "financial" || selectedRow.data.kind !== "invoice") return null;
    return invoiceRowQueueKey(selectedRow.data);
  }, [selectedRow]);

  const queuePosition = useMemo(
    () => weddingQueuePosition(orderedKeys, selectedKey),
    [orderedKeys, selectedKey],
  );

  const goPrevRow = useCallback(() => {
    const k = adjacentWeddingIdInOrderedList(orderedKeys, selectedKey, -1);
    if (!k) return;
    const r = invoices.find((row) => invoiceRowQueueKey(row) === k);
    if (r) setSelectedRow({ kind: "financial", data: r });
  }, [orderedKeys, selectedKey, invoices, setSelectedRow]);

  const goNextRow = useCallback(() => {
    const k = adjacentWeddingIdInOrderedList(orderedKeys, selectedKey, 1);
    if (!k) return;
    const r = invoices.find((row) => invoiceRowQueueKey(row) === k);
    if (r) setSelectedRow({ kind: "financial", data: r });
  }, [orderedKeys, selectedKey, invoices, setSelectedRow]);

  useEffect(() => {
    if (orderedKeys.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const k = adjacentWeddingIdInOrderedList(orderedKeys, selectedKey, delta);
      if (!k) return;
      const r = invoices.find((row) => invoiceRowQueueKey(row) === k);
      if (!r) return;
      if (k === selectedKey) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedRow({ kind: "financial", data: r });
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedKeys, selectedKey, invoices, setSelectedRow]);

  useLayoutEffect(() => {
    if (!selectedKey) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-workspace-invoice-row="${CSS.escape(selectedKey)}"]`);
    if (el instanceof HTMLElement) scrollPipelineWeddingRowIntoView(el);
  }, [selectedKey, orderedKeys]);

  const stats = [
    { label: "Total Revenue (YTD)", value: fmtEur(financialStats.totalRevenue), icon: TrendingUp, color: "text-emerald-600" },
    { label: "Outstanding", value: fmtEur(financialStats.outstanding), icon: Clock, color: "text-amber-600" },
    { label: "Overdue", value: fmtEur(financialStats.overdue), icon: AlertTriangle, color: "text-rose-600" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-row items-center justify-between border-b border-border bg-background px-6 py-5 min-h-[88px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">Invoices</h2>
          <p className="text-sm text-muted-foreground">
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {orderedKeys.length >= 2 ? (
            <div
              role="region"
              aria-label="Invoices table queue navigation"
              className="flex items-center gap-1"
            >
              {queuePosition ? (
                <span className="mr-0.5 tabular-nums text-[12px] text-muted-foreground" aria-live="polite">
                  {queuePosition.current} / {queuePosition.total}
                </span>
              ) : null}
              <button
                type="button"
                title="Previous row (Alt+↑)"
                aria-label="Previous row in invoice list"
                onClick={goPrevRow}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Next row (Alt+↓)"
                aria-label="Next row in invoice list"
                onClick={goNextRow}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={openNewInvoice}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            New Invoice
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-1.5">
                <s.icon className={cn("h-3.5 w-3.5", s.color)} strokeWidth={1.75} />
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</span>
              </div>
              <p className="mt-1.5 text-[17px] font-semibold tabular-nums text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-background text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5">Date</th>
              <th className="px-5 py-2.5">Couple / Project</th>
              <th className="px-5 py-2.5">Description</th>
              <th className="px-5 py-2.5 text-right">Amount</th>
              <th className="px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  No invoices match your search.
                </td>
              </tr>
            ) : (
              invoices.map((row) => {
                const isSelected =
                  selectedRow?.kind === "financial" &&
                  selectedRow.data.kind === "invoice" &&
                  selectedRow.data.id === row.id;
                const qk = invoiceRowQueueKey(row);
                return (
                  <tr
                    key={qk}
                    data-workspace-invoice-row={qk}
                    onClick={() => setSelectedRow({ kind: "financial", data: row })}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                      isSelected ? "bg-accent" : "hover:bg-accent/40",
                    )}
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground">
                      {row.meta?.replace("Due ", "") ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 font-medium text-foreground">{row.couple}</td>
                    <td className="max-w-[200px] truncate px-5 py-2.5 text-muted-foreground" title={row.title}>
                      {row.title}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-foreground">
                      {row.amountLabel ?? "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusPill(row.status))}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
