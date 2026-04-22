import { useCallback, useEffect, useState } from "react";
import { Building2, FileInput, Info, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  fetchStudioProfileReviewData,
  type StudioProfileReviewData,
} from "@/lib/assistantStudioProfileRead";
import {
  fetchStudioProfileChangeProposals,
  type StudioProfileChangeProposalListRow,
} from "@/lib/fetchStudioProfileChangeProposals";
import { reviewStudioProfileChangeProposal } from "@/lib/reviewStudioProfileChangeProposal";
import { applyStudioProfileChangeProposal } from "@/lib/applyStudioProfileChangeProposal";
import type { AssistantStudioProfileCapability, AssistantStudioProfileIdentity } from "@/types/assistantContext.types";
import type { EffectiveGeography } from "@/lib/studioEffectiveGeography";
import { formatStudioProfileChangeProposalForReview } from "@/lib/studioProfileChangeProposalBounds";
import { buildStudioProfileChangeProposalDiff, type StudioProfileProposalDiffLine } from "@/lib/studioProfileChangeProposalDiff";
import { cn } from "@/lib/utils";

function labelRow(key: string, label: string, value: string | null) {
  return (
    <div key={key} className="min-w-0 sm:col-span-1">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[12px] text-foreground/90 break-words">{value ?? "—"}</dd>
    </div>
  );
}

function posturePlainEnglish(p: EffectiveGeography["posture"]): string {
  if (p === "explicit_service_areas") return "Explicit service areas (map-based coverage when present).";
  if (p === "coarse_geographic_scope") return "Coarse geographic scope (fallback from profile flags).";
  return "Unset (no explicit coverage layer detected).";
}

function proposalStatusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "pending_review") return "border-amber-200/80 bg-amber-50 text-amber-950";
  if (s === "applied") return "border-emerald-200/80 bg-emerald-50 text-emerald-950";
  if (s === "rejected") return "border-rose-200/80 bg-rose-50 text-rose-950";
  if (s === "withdrawn" || s === "superseded") return "border-border bg-muted text-muted-foreground";
  return "border-border bg-muted/80 text-muted-foreground";
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function proposalDiffTable(lines: StudioProfileProposalDiffLine[], title: string) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] font-semibold text-foreground/90">{title}</p>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[320px] border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[9px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Field</th>
              <th className="px-2 py-1.5 font-medium">Current (live)</th>
              <th className="px-2 py-1.5 font-medium">Proposed (patch)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.group}-${line.key}`} className="border-b border-border/80 last:border-0">
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

function capSection(title: string, cap: AssistantStudioProfileCapability) {
  const rows: [string, string | null][] = [
    ["Service types", cap.service_types],
    ["Core services", cap.core_services],
    ["Deliverable types", cap.deliverable_types],
    ["Geographic scope (row)", cap.geographic_scope],
    ["Travel / policy", cap.travel_policy],
    ["Service availability", cap.service_availability],
    ["Booking scope", cap.booking_scope],
    ["Client types", cap.client_types],
    ["Lead acceptance", cap.lead_acceptance_rules],
    ["Language support", cap.language_support],
    ["Team structure", cap.team_structure],
    ["Extensions (labels / custom)", cap.extensions_summary],
    ["source_type", cap.source_type],
    ["Row updated at", cap.updated_at],
  ];
  return (
    <section className="space-y-2">
      <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
      <dl className="grid gap-2 sm:grid-cols-2">{rows.map(([k, v]) => labelRow(k, k, v))}</dl>
    </section>
  );
}

function identitySection(id: AssistantStudioProfileIdentity) {
  return (
    <section className="space-y-2">
      <h3 className="text-[12px] font-semibold text-foreground">Identity &amp; runtime (from settings)</h3>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Same contract fields Ana uses in context — <span className="font-medium text-foreground/80">not</span> playbook
        text.
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {labelRow("studio_name", "Studio name", id.studio_name)}
        {labelRow("manager", "Manager name", id.manager_name)}
        {labelRow("photographers", "Photographer names", id.photographer_names)}
        {labelRow("tz", "Timezone", id.timezone)}
        {labelRow("currency", "Currency", id.currency)}
        {labelRow("base", "Base location (structured label)", id.base_location)}
        {labelRow("inquiry", "Inquiry first-step style", id.inquiry_first_step_style)}
      </dl>
    </section>
  );
}

function geographySection(geo: EffectiveGeography) {
  const mode = geo.geographic_scope?.mode != null ? String(geo.geographic_scope.mode) : null;
  const blocked = geo.blocked_regions.length > 0 ? geo.blocked_regions.join(", ") : null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        <MapPin className="h-3.5 w-3.5 opacity-80" aria-hidden />
        Geographic coverage (derived)
      </h3>
      <p className="text-[11px] leading-snug text-muted-foreground">
        From <code className="rounded bg-muted px-1 text-[10px]">readStudioEffectiveGeographyFromRows</code> — how
        base location, <code className="rounded bg-muted px-1 text-[10px]">extensions.service_areas</code>, and{" "}
        <code className="rounded bg-muted px-1 text-[10px]">geographic_scope</code> line up in our contract.
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {labelRow("posture", "Posture", posturePlainEnglish(geo.posture))}
        {labelRow(
          "base_structured",
          "Base / identity (structured)",
          geo.base_location
            ? `${geo.base_location.label ?? ""}${
                geo.base_location.country_code ? ` (${geo.base_location.country_code})` : ""
              }`.trim() || "—"
            : "—",
        )}
        {labelRow("area_count", "Explicit service area rows", String(geo.service_areas.length))}
        {labelRow("coarse", "Coarse scope mode (if any)", mode)}
        {labelRow("blocked", "Blocked regions (if any)", blocked)}
      </dl>
    </section>
  );
}

export function StudioProfileReviewPage() {
  const { photographerId } = useAuth();
  const [data, setData] = useState<StudioProfileReviewData | null>(null);
  const [proposals, setProposals] = useState<StudioProfileChangeProposalListRow[]>([]);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [actingProposalId, setActingProposalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!photographerId) {
      setData(null);
      setProposals([]);
      setProposalsError(null);
      setLoading(false);
      setError("Not signed in.");
      return;
    }
    setLoading(true);
    setError(null);
    setProposalsError(null);
    const propRes = await fetchStudioProfileChangeProposals(supabase);
    setProposals(propRes.rows);
    setProposalsError(propRes.error);
    try {
      const profileRes = await fetchStudioProfileReviewData(supabase, photographerId);
      setData(profileRes);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load studio profile");
    } finally {
      setLoading(false);
    }
  }, [photographerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingProposals = proposals.filter((p) => p.review_status === "pending_review");
  const closedProposals = proposals.filter((p) => p.review_status !== "pending_review");

  async function runReviewAction(
    proposalId: string,
    action: "reject" | "withdraw",
  ) {
    if (actingProposalId) return;
    setReviewActionError(null);
    setActingProposalId(proposalId);
    const res = await reviewStudioProfileChangeProposal(supabase, { proposalId, action });
    setActingProposalId(null);
    if (!res.ok) {
      setReviewActionError(res.error);
      return;
    }
    await load();
  }

  async function runApply(proposalId: string) {
    if (actingProposalId) return;
    const ok = window.confirm(
      "Apply this proposal to your live studio profile? This will merge the bounded patches into your settings and/or business profile row (server-side). This is not an Ana auto-apply.",
    );
    if (!ok) return;
    setReviewActionError(null);
    setActingProposalId(proposalId);
    const res = await applyStudioProfileChangeProposal(supabase, { proposalId });
    setActingProposalId(null);
    if (!res.ok) {
      setReviewActionError(res.error);
      return;
    }
    await load();
  }

  function renderProposalRow(p: StudioProfileChangeProposalListRow, opts: { showActions: boolean; reviewData: StudioProfileReviewData | null }) {
    const base = opts.reviewData?.proposalDiffBase ?? { settings: {}, businessProfileJson: null };
    const diff = p.proposal
      ? buildStudioProfileChangeProposalDiff(p.proposal, base, { currentUnavailable: !opts.reviewData })
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
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] text-primary">Current vs proposed (read-only preview)</summary>
                {!opts.reviewData && (
                  <p
                    className="mt-1.5 rounded border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-[10px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100/95"
                    role="status"
                  >
                    Live profile did not load — the “current” column is unavailable. Proposed values still reflect the
                    stored patch.
                  </p>
                )}
                {proposalDiffTable(diff.settings, "Settings (identity / studio profile keys)")}
                {proposalDiffTable(diff.businessProfile, "Business profile row (finalize RPC keys)")}
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Preview only until you use <span className="font-medium text-foreground/80">Apply to live profile</span> (pending
                  rows) — the RPC merges the same patch shapes the diff shows, with DB validation.
                </p>
              </details>
            )}
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[10px] text-primary">View proposal detail</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 text-[10px] text-foreground/90">
                {formatStudioProfileChangeProposalForReview(p.proposal).join("\n")}
              </pre>
            </details>
          </>
        ) : null}
        {opts.showActions && p.review_status === "pending_review" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {p.proposal && diff && !diff.isEmpty && (
              <button
                type="button"
                disabled={actingProposalId === p.id}
                onClick={() => void runApply(p.id)}
                className="rounded border border-emerald-300/80 bg-emerald-50/90 px-2 py-1 text-[10px] font-medium text-emerald-950 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60 disabled:opacity-50"
              >
                {actingProposalId === p.id ? "Working…" : "Apply to live profile"}
              </button>
            )}
            <button
              type="button"
              disabled={actingProposalId === p.id}
              onClick={() => void runReviewAction(p.id, "withdraw")}
              className="rounded border border-border bg-muted/80 px-2 py-1 text-[10px] font-medium text-foreground/90 hover:bg-muted disabled:opacity-50"
            >
              {actingProposalId === p.id ? "Working…" : "Withdraw (queue)"}
            </button>
            <button
              type="button"
              disabled={actingProposalId === p.id}
              onClick={() => void runReviewAction(p.id, "reject")}
              className="rounded border border-rose-300/80 bg-rose-50/90 px-2 py-1 text-[10px] font-medium text-rose-950 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/60 disabled:opacity-50"
            >
              {actingProposalId === p.id ? "Working…" : "Reject"}
            </button>
          </div>
        )}
        {opts.showActions && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Apply</span> uses{" "}
            <code className="rounded bg-muted px-1">apply_studio_profile_change_proposal_v1</code> — merge + validation;
            <span className="font-medium text-foreground/80"> reject / withdraw</span> are status only (
            <code className="rounded bg-muted px-1">review_studio_profile_change_proposal</code>).
          </p>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground">
          <Building2 className="h-4 w-4 opacity-80" aria-hidden />
          Studio profile (review)
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/90">What your business offers, where, and how you run the studio</span> — the
          same capability layer <span className="font-medium text-foreground/90">Ana</span> reads. This is{" "}
          <span className="font-medium text-foreground/90">not</span> your message playbook. Playbook and policy live
          elsewhere (rules, case exceptions, tone).
        </p>
        <div
          className="flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          role="note"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span>
            <strong className="font-medium text-foreground/85">Review-first updates.</strong> The
            change-proposal contract (`StudioProfileChangeProposalV1`) is bounded; for pending rows you can{" "}
            <span className="font-medium">apply to live profile</span> (server RPC), or <span className="font-medium">reject / withdraw</span>{" "}
            (status only).
          </span>
        </div>
      </header>

      {!photographerId && <p className="text-[13px] text-muted-foreground">Sign in to view your studio profile.</p>}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {loading && photographerId && <p className="text-[13px] text-muted-foreground">Loading…</p>}

      {!loading && photographerId && (
        <section
          className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3"
          aria-labelledby="studio-profile-proposals-heading"
        >
            <h2 id="studio-profile-proposals-heading" className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <FileInput className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Change proposals (queue)
            </h2>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Stored rows use <code className="rounded bg-muted px-1 text-[10px]">StudioProfileChangeProposalV1</code> (schema 1) in
              <code className="rounded bg-muted px-1 text-[10px]"> studio_profile_change_proposals</code>. Patches are bounded: settings
              use <code className="rounded bg-muted px-1 text-[10px]">STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS</code> only; business
              profile keys match <code className="rounded bg-muted px-1 text-[10px]">finalize_onboarding_briefing_v1</code>.{" "}
              <span className="font-medium text-foreground/85">Apply to live profile</span> (pending, with patches) calls{" "}
              <code className="rounded bg-muted px-1 text-[10px]">apply_studio_profile_change_proposal_v1</code>.{" "}
              <span className="font-medium text-foreground/85">Withdraw</span> / <span className="font-medium text-foreground/85">Reject</span> use{" "}
              <code className="rounded bg-muted px-1 text-[10px]">review_studio_profile_change_proposal</code> (status only).
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              See <code className="rounded bg-muted px-1 text-[10px]">docs/v3/V3_STUDIO_PROFILE_CHANGE_PROPOSAL_FOUNDATION.md</code>.
            </p>
            {proposalsError && (
              <p className="mt-2 text-[11px] text-destructive">Could not load proposal queue: {proposalsError}</p>
            )}
            {reviewActionError && (
              <p className="mt-2 text-[11px] text-destructive" role="alert">
                {reviewActionError}
              </p>
            )}
            {proposals.length === 0 && !proposalsError ? (
              <p className="mt-3 text-[12px] text-muted-foreground">No proposals in the queue yet.</p>
            ) : (
              <div className="mt-3 space-y-4">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pending review</h3>
                  {pendingProposals.length === 0 ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">No pending proposals.</p>
                  ) : (
                    <ul className="mt-2 space-y-3">
                      {pendingProposals.map((p) => renderProposalRow(p, { showActions: true, reviewData: data }))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Closed (rejected, withdrawn, …)
                  </h3>
                  {closedProposals.length === 0 ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">No closed proposals yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-3">
                      {closedProposals.map((p) => renderProposalRow(p, { showActions: false, reviewData: data }))}
                    </ul>
                  )}
                </div>
              </div>
            )}
        </section>
      )}

      {!loading && data && !error && (
        <div className="space-y-6">
          {identitySection(data.profile.identity)}

          {geographySection(data.effectiveGeography)}

          {data.profile.hasBusinessProfileRow && data.profile.capability ? (
            <div
              className={cn(
                "space-y-4 rounded-lg border border-border bg-card px-4 py-3 shadow-sm",
                "border-cyan-200/50 bg-cyan-50/40 dark:border-cyan-900/30 dark:bg-cyan-950/20",
              )}
            >
              <h2 className="text-[12px] font-semibold text-foreground/95">Business profile row (studio_business_profiles)</h2>
              <p className="text-[11px] text-muted-foreground">
                JSON-backed columns, summarized the same way as Ana’s context — not a raw API dump.
              </p>
              {capSection("Capability (summarized)", data.profile.capability)}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No <code className="rounded bg-muted px-1.5 text-[11px]">studio_business_profiles</code> row for this
              account yet. Identity fields above may still be set in settings from onboarding.
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: dock <strong className="font-medium text-foreground/80">Projects</strong> → Studio tools →{" "}
        <strong className="font-medium text-foreground/80">Studio profile (review)</strong>.
      </p>
    </div>
  );
}
