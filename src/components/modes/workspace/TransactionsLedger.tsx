import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "@/lib/pipelineWeddingListNavigation";
import { useWorkspaceMode } from "./WorkspaceModeContext";
import type { FinancialTransaction } from "../../../data/weddingFinancials";

const METHOD_LABELS: Record<FinancialTransaction["method"], string> = {
  stripe: "Stripe",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Check",
};

function matchSearch(tx: FinancialTransaction, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    tx.couple.toLowerCase().includes(s) ||
    tx.note.toLowerCase().includes(s) ||
    tx.method.toLowerCase().includes(s) ||
    tx.date.includes(s)
  );
}

export function TransactionsLedger() {
  const { transactions, searchQuery, selectedTransactionId, setSelectedTransactionId } = useWorkspaceMode();

  const filtered = useMemo(
    () => transactions.filter((tx) => matchSearch(tx, searchQuery)),
    [transactions, searchQuery],
  );

  const listScrollRef = useRef<HTMLDivElement>(null);

  const orderedIds = useMemo(() => filtered.map((tx) => tx.id), [filtered]);

  const queuePosition = useMemo(
    () => weddingQueuePosition(orderedIds, selectedTransactionId),
    [orderedIds, selectedTransactionId],
  );

  useEffect(() => {
    if (
      selectedTransactionId &&
      !filtered.some((tx) => tx.id === selectedTransactionId)
    ) {
      setSelectedTransactionId(null);
    }
  }, [filtered, selectedTransactionId, setSelectedTransactionId]);

  const goPrev = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedIds, selectedTransactionId, -1);
    if (!id) return;
    setSelectedTransactionId(id);
  }, [orderedIds, selectedTransactionId, setSelectedTransactionId]);

  const goNext = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedIds, selectedTransactionId, 1);
    if (!id) return;
    setSelectedTransactionId(id);
  }, [orderedIds, selectedTransactionId, setSelectedTransactionId]);

  useEffect(() => {
    if (orderedIds.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentWeddingIdInOrderedList(orderedIds, selectedTransactionId, delta);
      if (!id || id === selectedTransactionId) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedTransactionId(id);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedIds, selectedTransactionId, setSelectedTransactionId]);

  useLayoutEffect(() => {
    if (!selectedTransactionId) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector(
      `[data-workspace-transaction-row="${CSS.escape(selectedTransactionId)}"]`,
    );
    if (el instanceof HTMLElement) scrollPipelineWeddingRowIntoView(el);
  }, [selectedTransactionId, orderedIds]);

  const total = useMemo(
    () => filtered.reduce((sum, tx) => sum + tx.amount, 0),
    [filtered],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-row items-center justify-between border-b border-border bg-background px-6 py-5 min-h-[88px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">Transactions</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} payment{filtered.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {orderedIds.length >= 2 ? (
            <div
              role="region"
              aria-label="Transactions table queue navigation"
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
                aria-label="Previous transaction in list"
                onClick={goPrev}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Next row (Alt+↓)"
                aria-label="Next transaction in list"
                onClick={goNext}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : null}
          {filtered.length > 0 && (
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Received</p>
              <p className="text-[15px] font-semibold tabular-nums text-emerald-700">
                €{total.toLocaleString("en")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-background text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5">Date</th>
              <th className="px-5 py-2.5">Couple</th>
              <th className="px-5 py-2.5">Note</th>
              <th className="px-5 py-2.5">Method</th>
              <th className="px-5 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  No transactions match your search.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const isSelected = selectedTransactionId === tx.id;
                return (
                  <tr
                    key={tx.id}
                    data-workspace-transaction-row={tx.id}
                    onClick={() => setSelectedTransactionId(tx.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                      isSelected ? "bg-accent" : "hover:bg-accent/40",
                    )}
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground">{tx.date}</td>
                    <td className="px-5 py-2.5 font-medium text-foreground">{tx.couple}</td>
                    <td className="max-w-[240px] truncate px-5 py-2.5 text-muted-foreground" title={tx.note}>
                      {tx.note}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {METHOD_LABELS[tx.method]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums font-medium text-emerald-700">
                      +{new Intl.NumberFormat("en", { style: "currency", currency: tx.currency, maximumFractionDigits: 0 }).format(tx.amount)}
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
