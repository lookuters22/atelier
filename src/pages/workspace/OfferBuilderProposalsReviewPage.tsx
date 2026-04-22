import { useCallback, useEffect, useMemo, useState } from "react";
import { FileInput, Info, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  fetchOfferBuilderChangeProposals,
  type OfferBuilderChangeProposalListRow,
} from "@/lib/fetchOfferBuilderChangeProposals";
import {
  formatOfferBuilderChangeProposalForReview,
  offerBuilderMetadataPatchHasEffect,
} from "@/lib/offerBuilderChangeProposalBounds";
import { listOfferProjects, type OfferProjectRecord } from "@/lib/offerProjectsStorage";
import { applyOfferBuilderChangeProposal } from "@/lib/applyOfferBuilderChangeProposal";
import { reviewOfferBuilderChangeProposal } from "@/lib/reviewOfferBuilderChangeProposal";
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

function renderProposalRow(
  p: OfferBuilderChangeProposalListRow,
  projectNameById: Map<string, string>,
  reviewActionUi: {
    show: boolean;
    actingProposalId: string | null;
    onApply: (id: string) => void;
    onReject: (id: string) => void;
    onWithdraw: (id: string) => void;
  } | null,
) {
  const projectLabel = projectNameById.get(p.project_id) ?? p.project_id;
  const showButtons = reviewActionUi?.show === true && p.review_status === "pending_review";
  const canApply =
    showButtons &&
    p.proposal != null &&
    !p.payload_error &&
    offerBuilderMetadataPatchHasEffect(p.proposal.metadata_patch);
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
      <p className="mt-1 text-[10px] text-muted-foreground">
        Project: <span className="font-medium text-foreground/85">{projectLabel}</span>
      </p>
      {p.payload_error ? (
        <p className="mt-1 text-destructive">Invalid payload: {p.payload_error}</p>
      ) : p.proposal ? (
        <>
          <p className="mt-1 text-foreground/90">{p.rationale_preview}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Source: {p.proposal.source}</p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[10px] text-primary">View proposal (bounded contract)</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 text-[10px] text-foreground/90">
              {formatOfferBuilderChangeProposalForReview(p.proposal).join("\n")}
            </pre>
          </details>
        </>
      ) : null}
      {showButtons && reviewActionUi && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canApply && (
            <button
              type="button"
              data-testid={`apply-offer-proposal-${p.id}`}
              disabled={reviewActionUi.actingProposalId === p.id}
              onClick={() => reviewActionUi.onApply(p.id)}
              className="rounded border border-emerald-300/80 bg-emerald-50/90 px-2 py-1 text-[10px] font-medium text-emerald-950 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60 disabled:opacity-50"
            >
              {reviewActionUi.actingProposalId === p.id ? "Working…" : "Apply to live offer"}
            </button>
          )}
          <button
            type="button"
            disabled={reviewActionUi.actingProposalId === p.id}
            onClick={() => reviewActionUi.onWithdraw(p.id)}
            className="rounded border border-border bg-muted/80 px-2 py-1 text-[10px] font-medium text-foreground/90 hover:bg-muted disabled:opacity-50"
          >
            {reviewActionUi.actingProposalId === p.id ? "Working…" : "Withdraw (queue)"}
          </button>
          <button
            type="button"
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

export function OfferBuilderProposalsReviewPage() {
  const { photographerId } = useAuth();
  const [proposals, setProposals] = useState<OfferBuilderChangeProposalListRow[]>([]);
  const [projects, setProjects] = useState<OfferProjectRecord[]>([]);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [actingProposalId, setActingProposalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const pr of projects) {
      m.set(pr.id, pr.name);
    }
    return m;
  }, [projects]);

  const load = useCallback(async () => {
    if (!photographerId) {
      setProposals([]);
      setProjects([]);
      setProposalsError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setProposalsError(null);
    const propRes = await fetchOfferBuilderChangeProposals(supabase);
    setProposals(propRes.rows);
    setProposalsError(propRes.error);
    try {
      setProjects(await listOfferProjects(photographerId));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [photographerId]);

  const refreshQueueState = useCallback(async () => {
    if (!photographerId) return;
    const propRes = await fetchOfferBuilderChangeProposals(supabase);
    setProposals(propRes.rows);
    setProposalsError(propRes.error);
    try {
      setProjects(await listOfferProjects(photographerId));
    } catch {
      // keep list labels stale only on failure; proposals still refetched
    }
  }, [photographerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runReviewAction(proposalId: string, action: "reject" | "withdraw") {
    if (actingProposalId) return;
    setReviewActionError(null);
    setActingProposalId(proposalId);
    const res = await reviewOfferBuilderChangeProposal(supabase, { proposalId, action });
    setActingProposalId(null);
    if (!res.ok) {
      setReviewActionError(res.error);
      return;
    }
    await refreshQueueState();
  }

  async function runApply(proposalId: string) {
    if (actingProposalId) return;
    setReviewActionError(null);
    setActingProposalId(proposalId);
    const res = await applyOfferBuilderChangeProposal(supabase, { proposalId });
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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground">
            <Package className="h-4 w-4 opacity-80" aria-hidden />
            Offer change proposals
          </div>
          <Link
            to="/workspace/offer-builder"
            className="text-[12px] text-primary underline underline-offset-2 hover:text-foreground/90"
          >
            Back to offer builder
          </Link>
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/90">Review-first queue</span> for{" "}
          <span className="font-medium text-foreground/90">Ana-enqueued</span> renames and document titles. Rows store{" "}
          <code className="rounded bg-muted px-1 text-[10px]">OfferBuilderChangeProposalV1</code> only (bounded{" "}
          <code className="rounded bg-muted px-1 text-[10px]">name</code> /{" "}
          <code className="rounded bg-muted px-1 text-[10px]">root_title</code>
          ) — <span className="font-medium text-foreground/90">not</span> full Puck or layout edits.
        </p>
        <div
          className="flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          role="note"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span>
            <strong className="font-medium text-foreground/85">Apply to live offer</strong> uses the server function{" "}
            <code className="rounded bg-background px-1">apply_offer_builder_change_proposal_v1</code> — list label (
            <code className="rounded bg-background px-1">name</code>) and document title (
            <code className="rounded bg-background px-1">root_title</code> via{" "}
            <code className="rounded bg-background px-1">puck_data.root.props.title</code>) only. No block content or
            layout.
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

      {loading && photographerId && <p className="text-[13px] text-muted-foreground">Loading…</p>}

      {!loading && photographerId && (
        <>
          <section
            className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3"
            aria-labelledby="offer-pending-proposals-heading"
          >
            <h2
              id="offer-pending-proposals-heading"
              className="flex items-center gap-2 text-[12px] font-semibold text-foreground"
            >
              <FileInput className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Pending review
            </h2>
            {pendingProposals.length > 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/80">Apply to live offer</span> when the payload is valid.{" "}
                <span className="font-medium text-foreground/80">Withdraw</span> /{" "}
                <span className="font-medium text-foreground/80">Reject</span> use{" "}
                <code className="rounded bg-muted px-1">review_offer_builder_change_proposal</code> (status only).
              </p>
            )}
            {pendingProposals.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">No proposals awaiting review.</p>
            ) : (
              <ul className="mt-3 space-y-2" role="list">
                {pendingProposals.map((p) => renderProposalRow(p, projectNameById, pendingReviewActionUi))}
              </ul>
            )}
          </section>

          <section
            className="rounded-lg border border-border bg-background/50 px-4 py-3"
            aria-labelledby="offer-reviewed-proposals-heading"
          >
            <h2 id="offer-reviewed-proposals-heading" className="text-[12px] font-semibold text-foreground">
              Reviewed / closed
            </h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Rejected, withdrawn, superseded, or applied — status comes from the database when that workflow exists.
            </p>
            {reviewedProposals.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">No closed proposals yet.</p>
            ) : (
              <ul className="mt-3 space-y-2" role="list">
                {reviewedProposals.map((p) => renderProposalRow(p, projectNameById, null))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
