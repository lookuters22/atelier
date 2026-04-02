import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useWorkspaceMode } from "./WorkspaceModeContext";
import { FinancialOverview } from "./FinancialOverview";
import { InvoiceLedger } from "./InvoiceLedger";
import { TransactionsLedger } from "./TransactionsLedger";
import type { FinancialsOverviewRow } from "../../../data/weddingFinancials";

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === "sent" || s === "draft") return "border-amber-200/80 bg-amber-50 text-amber-900";
  if (s === "accepted" || s === "signed" || s === "paid") return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
  if (s === "partial") return "border-sky-200/80 bg-sky-50 text-sky-900";
  if (s === "overdue" || s === "expired" || s === "void") return "border-rose-200/80 bg-rose-50 text-rose-900";
  return "border-border bg-muted/60 text-muted-foreground";
}

function kindLabel(kind: FinancialsOverviewRow["kind"]): string {
  if (kind === "proposal") return "Proposal";
  if (kind === "contract") return "Contract";
  return "Invoice";
}

function matchesFinancialSearch(r: FinancialsOverviewRow, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    r.couple.toLowerCase().includes(s) ||
    r.title.toLowerCase().includes(s) ||
    r.status.toLowerCase().includes(s) ||
    (r.amountLabel?.toLowerCase().includes(s) ?? false) ||
    (r.meta?.toLowerCase().includes(s) ?? false)
  );
}

function GenericFinancialsLedger() {
  const { activeIndex, financialRows, searchQuery, selectedRow, setSelectedRow } = useWorkspaceMode();

  const kind = activeIndex === "contracts" ? "contract" : "proposal";

  const filtered = useMemo(
    () =>
      financialRows
        .filter((r) => r.kind === kind)
        .filter((r) => matchesFinancialSearch(r, searchQuery)),
    [financialRows, kind, searchQuery],
  );

  const selectedId = selectedRow?.kind === "financial" ? selectedRow.data.id : null;

  const title = kind === "contract" ? "Agreements & Contracts" : "Proposals";
  const subtitle = `${filtered.length} ${kind}${filtered.length !== 1 ? "s" : ""}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-row items-center justify-between border-b border-border bg-background px-6 py-5 min-h-[88px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-background text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Wedding</th>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Amount</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No {kind}s match your search.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const isSelected = selectedId === r.id;
                return (
                  <tr
                    key={`${r.kind}-${r.id}`}
                    onClick={() => setSelectedRow({ kind: "financial", data: r })}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                      isSelected ? "bg-accent" : "hover:bg-accent/40",
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{kindLabel(r.kind)}</td>
                    <td className="px-4 py-2.5 text-foreground">{r.couple}</td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-muted-foreground" title={r.title}>
                      {r.title}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{r.amountLabel ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                          statusPill(r.status),
                        )}
                      >
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-[12px] text-muted-foreground" title={r.meta}>
                      {r.meta ?? "—"}
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

function StudioToolPane() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}

export function WorkspaceLedger() {
  const { activeIndex } = useWorkspaceMode();
  const { pathname } = useLocation();

  const isStudioRoute =
    pathname.startsWith("/workspace/pricing-calculator") ||
    pathname.startsWith("/workspace/offer-builder") ||
    pathname.startsWith("/workspace/invoices");

  if (isStudioRoute) return <StudioToolPane />;

  switch (activeIndex) {
    case "fin-overview":
      return <FinancialOverview />;
    case "invoices":
      return <InvoiceLedger />;
    case "transactions":
      return <TransactionsLedger />;
    case "contracts":
    case "proposals":
      return <GenericFinancialsLedger />;
    default:
      return <FinancialOverview />;
  }
}
