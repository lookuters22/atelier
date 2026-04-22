import { useCallback, useEffect, useState } from "react";
import { FileText, Info, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  fetchInvoiceSetupChangeProposals,
  type InvoiceSetupChangeProposalListRow,
} from "@/lib/fetchInvoiceSetupChangeProposals";
import {
  formatInvoiceSetupChangeProposalForReview,
  invoiceSetupTemplatePatchHasEffect,
} from "@/lib/invoiceSetupChangeProposalBounds";
import { applyInvoiceSetupChangeProposal } from "@/lib/applyInvoiceSetupChangeProposal";
import {
  buildInvoiceSetupChangeProposalDiff,
  type InvoiceSetupLiveTemplateSlice,
  type InvoiceSetupProposalDiffLine,
} from "@/lib/invoiceSetupChangeProposalDiff";
import { fetchInvoiceSetupRemote } from "@/lib/invoiceSetupRemote";
import { reviewInvoiceSetupChangeProposal } from "@/lib/reviewInvoiceSetupChangeProposal";
import type { InvoiceSetupState } from "@/lib/invoiceSetupTypes";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function proposalStatusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "pending_review") return "border-amber-200/80 bg-amber-50 text-amber-950";
  if (s === "applied") return "border-emerald-200/80 bg-emerald-50 text-emerald-950";
  if (s === "rejected") return "border-rose-200/80 bg-rose-50 text-rose-950";
  if (s === "withdrawn" || s === "superseded") return "border-border bg-muted text-muted-foreground";
  return "border-border bg-muted/80 text-muted-foreground";
}

function sliceLiveTemplate(setup: InvoiceSetupState): InvoiceSetupLiveTemplateSlice {
  return {
    legalName: setup.legalName,
    invoicePrefix: setup.invoicePrefix,
    paymentTerms: setup.paymentTerms,
    accentColor: setup.accentColor,
    footerNote: setup.footerNote,
  };
}

function proposalDiffTable(lines: InvoiceSetupProposalDiffLine[], title: string) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 space-y-1" data-testid="invoice-proposal-diff-table">
      <p className="text-[10px] font-semibold text-foreground/90">{title}</p>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[320px] border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[9px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Field</th>
              <th className="px-2 py-1.5 font-medium">Current (live)</th>
              <th className="px-2 py-1.5 font-medium">Proposed (apply)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-b border-border/80 last:border-0">
                <td className="px-2 py-1.5 align-top font-medium text-foreground/85">{line.label}</td>
                <td className="px-2 py-1.5 align-top break-words text-muted-foreground">{line.currentDisplay}</td>
                <td className="px-2 py-1.5 align-top break-words text-foreground/90">{line.proposedDisplay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderProposalRow(
  p: InvoiceSetupChangeProposalListRow,
  reviewActionUi: {
    show: boolean;
    actingProposalId: string | null;
    onApply: (id: string) => void;
    onReject: (id: string) => void;
    onWithdraw: (id: string) => void;
  } | null,
  diffContext: { live: InvoiceSetupLiveTemplateSlice | null; liveLoadFailed: boolean; noRow: boolean },
) {
  const showButtons = reviewActionUi?.show === true && p.review_status === "pending_review";
  const canApply =
    showButtons &&
    p.proposal != null &&
    !p.payload_error &&
    invoiceSetupTemplatePatchHasEffect(p.proposal.template_patch);

  const diff =
    p.proposal && !p.payload_error
      ? buildInvoiceSetupChangeProposalDiff(p.proposal, diffContext.live, {
          currentUnavailable: diffContext.liveLoadFailed,
        })
      : null;
  return (
    <li
      key={p.id}
      className="rounded-md border border-border bg-background/60 px-3 py-2 text-[11px] leading-snug"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{p.id}</span>
        <div className="flex items-center gap-2">
          <time className="text-[10px] text-muted-foreground" dateTime={p.created_at}>
            {formatWhen(p.created_at)}
          </time>
          <span
            className={cn(
              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
              proposalStatusPillClass(p.review_status),
            )}
          >
            {p.review_status.replace(/_/g, " ")}
          </span>
        </div>
      </div>
      {p.payload_error ? (
        <p className="mt-1 text-destructive">Invalid payload: {p.payload_error}</p>
      ) : p.proposal ? (
        <>
          <p className="mt-1 text-foreground/90">{p.rationale_preview}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Source: {p.proposal.source}</p>
          {diff && !diff.isEmpty && (
            <details className="mt-2" data-testid={`invoice-proposal-diff-${p.id}`}>
              <summary className="cursor-pointer text-[10px] text-primary">Current vs proposed (read-only preview)</summary>
              {diffContext.liveLoadFailed && (
                <p
                  className="mt-1.5 rounded border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-[10px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100/95"
                  role="status"
                >
                  Live invoice template did not load — the <strong>Current (live)</strong> column is unavailable.
                  Proposed values still match the stored patch (same merge as <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-950/50">apply_invoice_setup_change_proposal_v1</code>).
                </p>
              )}
              {!diffContext.liveLoadFailed && diffContext.noRow && (
                <p
                  className="mt-1.5 rounded border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-[10px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100/95"
                  role="status"
                >
                  No <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-950/50">studio_invoice_setup</code> row yet
                  — <strong>Current (live)</strong> is shown as <strong>—</strong> (no saved template). Apply will insert
                  defaults, then merge this patch. Logo is never changed from a proposal.
                </p>
              )}
              {proposalDiffTable(
                diff.lines,
                "Template (bounded fields — not logo; matches apply path)",
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">
                Preview only; <span className="font-medium text-foreground/80">Apply to live invoice PDF</span> uses the
                same field merge as the RPC. Logo is not read from the proposal.
              </p>
            </details>
          )}
          <details className="mt-1.5" data-testid={`invoice-proposal-details-${p.id}`}>
            <summary className="cursor-pointer text-[10px] text-primary">View proposal (bounded contract)</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 text-[10px] text-foreground/90">
              {formatInvoiceSetupChangeProposalForReview(p.proposal).join("\n")}
            </pre>
          </details>
        </>
      ) : null}
      {showButtons && reviewActionUi && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canApply && (
            <button
              type="button"
              data-testid={`apply-invoice-proposal-${p.id}`}
              disabled={reviewActionUi.actingProposalId === p.id}
              onClick={() => reviewActionUi.onApply(p.id)}
              className="rounded border border-emerald-300/80 bg-emerald-50/90 px-2 py-1 text-[10px] font-medium text-emerald-950 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60 disabled:opacity-50"
            >
              {reviewActionUi.actingProposalId === p.id ? "Working…" : "Apply to live invoice PDF"}
            </button>
          )}
          <button
            type="button"
            data-testid={`invoice-proposal-withdraw-${p.id}`}
            disabled={reviewActionUi.actingProposalId === p.id}
            onClick={() => reviewActionUi.onWithdraw(p.id)}
            className="rounded border border-border bg-muted/80 px-2 py-1 text-[10px] font-medium text-foreground/90 hover:bg-muted disabled:opacity-50"
          >
            {reviewActionUi.actingProposalId === p.id ? "Working…" : "Withdraw (queue)"}
          </button>
          <button
            type="button"
            data-testid={`invoice-proposal-reject-${p.id}`}
            disabled={reviewActionUi.actingProposalId === p.id}
            onClick={() => reviewActionUi.onReject(p.id)}
            className="rounded border border-rose-300/80 bg-rose-50/90 px-2 py-1 text-[10px] font-medium text-rose-950 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/60 disabled:opacity-50"
          >
            {reviewActionUi.actingProposalId === p.id ? "Working…" : "Reject"}
          </button>
        </div>
      )}
    </li>
  );
}

export function InvoiceSetupProposalsReviewPage() {
  const { photographerId } = useAuth();
  const [proposals, setProposals] = useState<InvoiceSetupChangeProposalListRow[]>([]);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [actingProposalId, setActingProposalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveTemplateSlice, setLiveTemplateSlice] = useState<InvoiceSetupLiveTemplateSlice | null>(null);
  const [liveLoadFailed, setLiveLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!photographerId) {
      setProposals([]);
      setProposalsError(null);
      setLiveTemplateSlice(null);
      setLiveLoadFailed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setProposalsError(null);
    setLiveLoadFailed(false);
    const propRes = await fetchInvoiceSetupChangeProposals(supabase);
    setProposals(propRes.rows);
    setProposalsError(propRes.error);
    try {
      const row = await fetchInvoiceSetupRemote(supabase, photographerId);
      if (row) {
        setLiveTemplateSlice(sliceLiveTemplate(row.template));
      } else {
        setLiveTemplateSlice(null);
      }
    } catch {
      setLiveTemplateSlice(null);
      setLiveLoadFailed(true);
    }
    setLoading(false);
  }, [photographerId]);

  const refreshQueueState = useCallback(async () => {
    if (!photographerId) return;
    const propRes = await fetchInvoiceSetupChangeProposals(supabase);
    setProposals(propRes.rows);
    setProposalsError(propRes.error);
    setLiveLoadFailed(false);
    try {
      const row = await fetchInvoiceSetupRemote(supabase, photographerId);
      if (row) {
        setLiveTemplateSlice(sliceLiveTemplate(row.template));
      } else {
        setLiveTemplateSlice(null);
      }
    } catch {
      setLiveTemplateSlice(null);
      setLiveLoadFailed(true);
    }
  }, [photographerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runApply(proposalId: string) {
    if (actingProposalId) return;
    setReviewActionError(null);
    setActingProposalId(proposalId);
    const res = await applyInvoiceSetupChangeProposal(supabase, { proposalId });
    setActingProposalId(null);
    if (!res.ok) {
      setReviewActionError(res.error);
      return;
    }
    await refreshQueueState();
  }

  async function runReviewAction(proposalId: string, action: "reject" | "withdraw") {
    if (actingProposalId) return;
    setReviewActionError(null);
    setActingProposalId(proposalId);
    const res = await reviewInvoiceSetupChangeProposal(supabase, { proposalId, action });
    setActingProposalId(null);
    if (!res.ok) {
      setReviewActionError(res.error);
      return;
    }
    await refreshQueueState();
  }

  const pendingProposals = proposals.filter((p) => p.review_status === "pending_review");
  const reviewedProposals = proposals.filter((p) => p.review_status !== "pending_review");

  const pendingReviewActionUi = {
    show: true,
    actingProposalId,
    onApply: (id: string) => void runApply(id),
    onReject: (id: string) => void runReviewAction(id, "reject"),
    onWithdraw: (id: string) => void runReviewAction(id, "withdraw"),
  } as const;

  const diffContext = {
    live: liveTemplateSlice,
    liveLoadFailed,
    noRow: !liveLoadFailed && liveTemplateSlice === null,
  } as const;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground">
            <Receipt className="h-4 w-4 opacity-80" aria-hidden />
            Invoice setup change proposals
          </div>
          <Link
            to="/workspace/invoices"
            className="text-[12px] text-primary underline underline-offset-2 hover:text-foreground/90"
          >
            Back to Invoice PDF setup
          </Link>
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/90">Review-first queue</span> for{" "}
          <span className="font-medium text-foreground/90">Ana-enqueued</span> template patches (branding, terms, accent —{" "}
          <span className="font-medium text-foreground/90"> not</span> logo). Rows store{" "}
          <code className="rounded bg-muted px-1 text-[10px]">InvoiceSetupChangeProposalV1</code> only. When a payload is
          valid, <strong className="font-medium text-foreground/85">Apply to live invoice PDF</strong> merges the bounded{" "}
          <code className="rounded bg-muted px-1">template_patch</code> into server storage;{" "}
          <strong className="font-medium text-foreground/85">Reject</strong> /{" "}
          <strong className="font-medium text-foreground/85">Withdraw</strong> only change queue status.
        </p>
        <div
          className="flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          role="note"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span>
            <strong className="font-medium text-foreground/85">Apply to live invoice PDF</strong> uses{" "}
            <code className="rounded bg-background px-1">apply_invoice_setup_change_proposal_v1</code> (allowlisted
            fields into <code className="rounded bg-background px-1">studio_invoice_setup.template</code> only).{" "}
            <strong className="font-medium text-foreground/85">Withdraw</strong> / <strong className="font-medium text-foreground/85">Reject</strong> use{" "}
            <code className="rounded bg-background px-1">review_invoice_setup_change_proposal</code> (status only). This is
            the reviewed apply path — not Ana auto-apply.
          </span>
        </div>
      </header>

      {!photographerId && <p className="text-[13px] text-muted-foreground">Sign in to view proposals.</p>}

      {proposalsError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {proposalsError}
        </div>
      )}

      {reviewActionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {reviewActionError}
        </div>
      )}

      {loading && photographerId && <p className="text-[13px] text-muted-foreground" data-testid="invoice-proposals-loading">Loading…</p>}

      {!loading && photographerId && (
        <>
          <section
            className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3"
            aria-labelledby="invoice-pending-proposals-heading"
          >
            <h2
              id="invoice-pending-proposals-heading"
              className="flex items-center gap-2 text-[12px] font-semibold text-foreground"
            >
              <FileText className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Pending review
            </h2>
            {pendingProposals.length > 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/80">Apply to live invoice PDF</span> (when the payload is
                valid) uses <code className="rounded bg-muted px-1">apply_invoice_setup_change_proposal_v1</code>.{" "}
                <span className="font-medium text-foreground/80">Withdraw</span> /{" "}
                <span className="font-medium text-foreground/80">Reject</span> use{" "}
                <code className="rounded bg-muted px-1">review_invoice_setup_change_proposal</code>.
              </p>
            )}
            {pendingProposals.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">No proposals awaiting review.</p>
            ) : (
              <ul className="mt-3 space-y-2" role="list" data-testid="invoice-pending-proposals">
                {pendingProposals.map((p) => renderProposalRow(p, pendingReviewActionUi, diffContext))}
              </ul>
            )}
          </section>

          <section
            className="rounded-lg border border-border bg-background/50 px-4 py-3"
            aria-labelledby="invoice-reviewed-proposals-heading"
          >
            <h2 id="invoice-reviewed-proposals-heading" className="text-[12px] font-semibold text-foreground">
              Reviewed / closed
            </h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Rejected, withdrawn, superseded, or applied when those statuses exist in the database.
            </p>
            {reviewedProposals.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">No closed proposals yet.</p>
            ) : (
              <ul className="mt-3 space-y-2" role="list" data-testid="invoice-reviewed-proposals">
                {reviewedProposals.map((p) => renderProposalRow(p, null, diffContext))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
