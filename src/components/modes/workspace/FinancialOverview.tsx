import { useMemo } from "react";
import { TrendingUp, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceMode } from "./WorkspaceModeContext";

function fmtEur(n: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

const STAT_CARDS = [
  { key: "totalRevenue", label: "Total Revenue (YTD)", icon: TrendingUp, color: "text-emerald-600" },
  { key: "outstanding", label: "Outstanding", icon: Clock, color: "text-amber-600" },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, color: "text-rose-600" },
] as const;

export function FinancialOverview() {
  const { financialStats, financialRows, transactions, setActiveIndex } = useWorkspaceMode();

  const recentInvoices = useMemo(
    () => financialRows.filter((r) => r.kind === "invoice").slice(0, 5),
    [financialRows],
  );

  const recentTx = useMemo(() => transactions.slice(0, 5), [transactions]);

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="flex shrink-0 flex-row items-center justify-between border-b border-border bg-background px-6 py-5 min-h-[88px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">Financial Overview</h2>
          <p className="text-sm text-muted-foreground">Studio-wide revenue and cash flow at a glance</p>
        </div>
        <div className="flex items-center" />
      </div>

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-3 gap-3">
          {STAT_CARDS.map((card) => {
            const value = financialStats[card.key];
            return (
              <div key={card.key} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <card.icon className={cn("h-4 w-4", card.color)} strokeWidth={1.75} />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </span>
                </div>
                <p className="mt-2 text-[20px] font-semibold tabular-nums text-foreground">{fmtEur(value)}</p>
              </div>
            );
          })}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Invoices
            </h3>
            <button
              type="button"
              onClick={() => setActiveIndex("invoices")}
              className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              View all <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
            </button>
          </div>
          <div className="rounded-lg border border-border bg-background">
            {recentInvoices.map((row, i) => (
              <div
                key={row.id}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 text-[13px]",
                  i < recentInvoices.length - 1 && "border-b border-border/60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{row.couple}</span>
                  <span className="ml-2 text-muted-foreground">{row.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] tabular-nums text-muted-foreground">{row.amountLabel}</span>
                  <StatusBadge status={row.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Transactions
            </h3>
            <button
              type="button"
              onClick={() => setActiveIndex("transactions")}
              className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              View all <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
            </button>
          </div>
          {recentTx.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">No transactions recorded yet.</p>
          ) : (
            <div className="rounded-lg border border-border bg-background">
              {recentTx.map((tx, i) => (
                <div
                  key={tx.id}
                  className={cn(
                    "flex items-center justify-between px-4 py-2.5 text-[13px]",
                    i < recentTx.length - 1 && "border-b border-border/60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{tx.couple}</span>
                    <span className="ml-2 text-muted-foreground">{tx.note}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] tabular-nums text-emerald-700 font-medium">
                      +{new Intl.NumberFormat("en", { style: "currency", currency: tx.currency, maximumFractionDigits: 0 }).format(tx.amount)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{tx.date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "border-border bg-muted/60 text-muted-foreground";
  if (s === "paid") cls = "border-emerald-200/80 bg-emerald-50 text-emerald-900";
  else if (s === "sent" || s === "draft") cls = "border-amber-200/80 bg-amber-50 text-amber-900";
  else if (s === "partial") cls = "border-sky-200/80 bg-sky-50 text-sky-900";
  else if (s === "overdue") cls = "border-rose-200/80 bg-rose-50 text-rose-900";

  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", cls)}>
      {status}
    </span>
  );
}
