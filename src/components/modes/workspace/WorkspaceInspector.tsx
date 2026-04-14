import { Link } from "react-router-dom";
import {
  Send,
  CheckCircle2,
  Eye,
  FileText,
  FileSignature,
  ScrollText,
  LayoutDashboard,
  ArrowLeftRight,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceMode } from "./WorkspaceModeContext";
import { InvoiceForm } from "./InvoiceForm";
import type { FinancialsOverviewRow, FinancialTransaction } from "../../../data/weddingFinancials";

const TX_METHOD_LABELS: Record<FinancialTransaction["method"], string> = {
  stripe: "Stripe",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Check",
};
import { getFinancialsForWedding } from "../../../data/weddingFinancials";

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === "sent" || s === "draft") return "border-amber-200/80 bg-amber-50 text-amber-900";
  if (s === "accepted" || s === "signed" || s === "paid") return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
  if (s === "partial") return "border-sky-200/80 bg-sky-50 text-sky-900";
  if (s === "overdue" || s === "expired" || s === "void") return "border-rose-200/80 bg-rose-50 text-rose-900";
  return "border-border bg-muted/60 text-muted-foreground";
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Send; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}

function IdleShell({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center border-l border-border bg-background px-8 text-center">
      {icon}
      <p className="mt-3 max-w-[220px] text-[12px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

function RecentCashflow() {
  const { transactions } = useWorkspaceMode();
  const recent = transactions.slice(0, 4);

  if (recent.length === 0) {
    return (
      <IdleShell
        icon={<DollarSign className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
        message="No transactions recorded yet. Payments will appear here as you record them."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background text-[13px] text-foreground">
      <div className="shrink-0 px-4 pt-4 pb-5">
        <h2 className="text-[13px] font-semibold text-foreground">Recent Cashflow</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Latest recorded payments</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-1.5">
        {recent.map((tx) => (
          <div key={tx.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-foreground">{tx.couple}</span>
              <span className="text-[12px] font-medium tabular-nums text-emerald-700">
                +{new Intl.NumberFormat("en", { style: "currency", currency: tx.currency, maximumFractionDigits: 0 }).format(tx.amount)}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">{tx.note}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{tx.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function IdleInspector() {
  const { activeIndex } = useWorkspaceMode();

  switch (activeIndex) {
    case "fin-overview":
    case "invoices":
      return <RecentCashflow />;
    case "contracts":
      return (
        <IdleShell
          icon={<FileSignature className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
          message="Select a contract to view its terms, signing status, and audit trail."
        />
      );
    case "proposals":
      return (
        <IdleShell
          icon={<ScrollText className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
          message="Select a proposal to view its details, version history, and acceptance status."
        />
      );
    default:
      return (
        <IdleShell
          icon={<LayoutDashboard className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
          message="Select an item to view details."
        />
      );
  }
}

function InvoiceDossier({ row }: { row: FinancialsOverviewRow }) {
  const bundle = getFinancialsForWedding(row.weddingId);
  const invoice = bundle.invoices.find((i) => i.id === row.id);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background text-[13px] text-foreground">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-accent/50">
            <FileText className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-foreground">{row.title}</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Invoice</p>
          </div>
        </div>

        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Wedding</span>
            <Link to={`/pipeline/${row.weddingId}`} className="font-medium text-[#2563eb] hover:underline">{row.couple}</Link>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium tabular-nums text-foreground">{row.amountLabel ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusPill(row.status))}>{row.status}</span>
          </div>
          {invoice && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Issued</span>
                <span className="text-foreground">{invoice.issuedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due</span>
                <span className="text-foreground">{invoice.dueDate}</span>
              </div>
            </>
          )}
        </div>

        {invoice && invoice.lineItems.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Line Items</h3>
            <div className="rounded-lg border border-border bg-background">
              {invoice.lineItems.map((li, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 text-[12px]",
                    i < invoice.lineItems.length - 1 && "border-b border-border/60",
                  )}
                >
                  <span className="min-w-0 flex-1 text-foreground">{li.description}</span>
                  <span className="shrink-0 pl-3 tabular-nums text-muted-foreground">
                    {li.quantity} × €{li.unitPrice.toLocaleString("en")}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-2 text-[12px] font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{row.amountLabel}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {row.status !== "paid" && (
            <ActionButton icon={CheckCircle2} label="Record Payment" onClick={() => alert("Payment recorded (demo)")} />
          )}
          <ActionButton icon={Send} label="Send Reminder" onClick={() => alert("Reminder sent (demo)")} />
        </div>
      </div>
    </div>
  );
}

function ContractDossier({ row }: { row: FinancialsOverviewRow }) {
  const bundle = getFinancialsForWedding(row.weddingId);
  const contract = bundle.contracts.find((c) => c.id === row.id);

  return (
    <div className="space-y-5 border-l border-border p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-accent/50">
          <FileSignature className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">{row.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Contract</p>
        </div>
      </div>
      <div className="space-y-2 text-[13px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Wedding</span>
          <Link to={`/pipeline/${row.weddingId}`} className="font-medium text-[#2563eb] hover:underline">{row.couple}</Link>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusPill(row.status))}>{row.status}</span>
        </div>
        {contract?.counterparty && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Counterparty</span>
            <span className="text-foreground">{contract.counterparty}</span>
          </div>
        )}
        {contract?.signedAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Signed</span>
            <span className="text-foreground">{contract.signedAt}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-4">
        <ActionButton icon={Eye} label="View PDF" onClick={() => alert("Opening PDF viewer (demo)")} />
        {row.status !== "signed" && (
          <ActionButton icon={Send} label="Resend for Signature" onClick={() => alert("Contract resent (demo)")} />
        )}
      </div>
    </div>
  );
}

function ProposalDossier({ row }: { row: FinancialsOverviewRow }) {
  const bundle = getFinancialsForWedding(row.weddingId);
  const proposal = bundle.proposals.find((p) => p.id === row.id);

  return (
    <div className="space-y-5 border-l border-border p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-accent/50">
          <ScrollText className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">{row.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Proposal</p>
        </div>
      </div>
      <div className="space-y-2 text-[13px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Wedding</span>
          <Link to={`/pipeline/${row.weddingId}`} className="font-medium text-[#2563eb] hover:underline">{row.couple}</Link>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium tabular-nums text-foreground">{row.amountLabel ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusPill(row.status))}>{row.status}</span>
        </div>
        {proposal?.sentAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sent</span>
            <span className="text-foreground">{proposal.sentAt}</span>
          </div>
        )}
        {proposal && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="text-foreground">v{proposal.version}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-4">
        <ActionButton icon={Eye} label="View Proposal" onClick={() => alert("Opening proposal (demo)")} />
        {row.status !== "accepted" && (
          <ActionButton icon={Send} label="Resend" onClick={() => alert("Proposal resent (demo)")} />
        )}
      </div>
    </div>
  );
}

function FinancialDossier({ row }: { row: FinancialsOverviewRow }) {
  if (row.kind === "invoice") return <InvoiceDossier row={row} />;
  if (row.kind === "contract") return <ContractDossier row={row} />;
  return <ProposalDossier row={row} />;
}

function TransactionDossier({ tx }: { tx: FinancialTransaction }) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background text-[13px] text-foreground">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-accent/50">
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-foreground">Recorded payment</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{tx.date}</p>
          </div>
        </div>
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Couple</span>
            <Link to={`/pipeline/${tx.weddingId}`} className="shrink-0 font-medium text-[#2563eb] hover:underline">
              {tx.couple}
            </Link>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium tabular-nums text-emerald-700">
              +{new Intl.NumberFormat("en", { style: "currency", currency: tx.currency, maximumFractionDigits: 0 }).format(tx.amount)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Method</span>
            <span className="text-foreground">{TX_METHOD_LABELS[tx.method]}</span>
          </div>
          {tx.note ? (
            <div className="pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{tx.note}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceInspector() {
  const { selectedRow, formMode, activeIndex, transactions, selectedTransactionId } = useWorkspaceMode();

  if (formMode?.kind === "new-invoice") return <InvoiceForm />;

  if (activeIndex === "transactions") {
    const tx = selectedTransactionId
      ? transactions.find((t) => t.id === selectedTransactionId)
      : undefined;
    if (tx) return <TransactionDossier tx={tx} />;
    return (
      <IdleShell
        icon={<ArrowLeftRight className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
        message="Transaction details will appear here when you select a payment record."
      />
    );
  }

  if (!selectedRow) return <IdleInspector />;
  return <FinancialDossier row={selectedRow.data} />;
}
