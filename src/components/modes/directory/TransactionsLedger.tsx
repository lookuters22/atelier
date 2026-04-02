import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useDirectoryMode } from "./DirectoryModeContext";
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
  const { transactions, searchQuery } = useDirectoryMode();

  const filtered = useMemo(
    () => transactions.filter((tx) => matchSearch(tx, searchQuery)),
    [transactions, searchQuery],
  );

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
        <div className="flex items-center">
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

      <div className="min-h-0 flex-1 overflow-auto">
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
              filtered.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-border/60 last:border-0"
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
