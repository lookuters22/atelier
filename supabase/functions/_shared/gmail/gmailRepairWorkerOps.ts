/**
 * A4: Shared operational state for Gmail inline-HTML repair workers (DB pause + last run).
 * Env secrets (`GMAIL_*_REPAIR_DISABLED`) remain hard kill-switches; DB `paused` is operator-toggleable.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { RunGmailInlineHtmlRepairBatchResult } from "./gmailRepairInlineHtmlToArtifact.ts";
import type { RunImportCandidateArtifactInlineHtmlRepairBatchResult } from "./gmailRepairImportCandidateMaterializationArtifact.ts";

export const GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML = "messages_inline_html" as const;
export const GMAIL_REPAIR_WORKER_IMPORT_CANDIDATE_ARTIFACT = "import_candidate_artifact" as const;

export type GmailRepairWorkerId =
  | typeof GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML
  | typeof GMAIL_REPAIR_WORKER_IMPORT_CANDIDATE_ARTIFACT;

/** Durable outcome of the last cron / manual batch (see `persistGmailRepairWorkerPauseSkip`). */
export type GmailRepairLastRunKind =
  | "success"
  | "skipped_env"
  | "skipped_db"
  | "partial_failure"
  | "rpc_error";

export type GmailRepairWorkerStateRow = {
  id: string;
  paused: boolean;
  paused_updated_at: string | null;
  last_run_at: string | null;
  last_run_ok: boolean | null;
  last_run_kind: string | null;
  last_run_scanned: number | null;
  last_run_migrated: number | null;
  last_run_failed: number | null;
  last_run_skipped_already_ref: number | null;
  last_run_skipped_artifact_fk: number | null;
  last_run_skipped_no_inline: number | null;
  last_run_failure_samples: unknown;
  last_run_error: string | null;
  updated_at: string;
};

export function gmailRepairMessagesInlineHtmlEnvDisabled(): boolean {
  return Deno.env.get("GMAIL_INLINE_HTML_REPAIR_DISABLED")?.trim() === "1";
}

export function gmailRepairImportCandidateArtifactEnvDisabled(): boolean {
  return Deno.env.get("GMAIL_IMPORT_CANDIDATE_ARTIFACT_HTML_REPAIR_DISABLED")?.trim() === "1";
}

export function gmailRepairEnvDisabledForWorker(workerId: GmailRepairWorkerId): boolean {
  if (workerId === GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML) {
    return gmailRepairMessagesInlineHtmlEnvDisabled();
  }
  return gmailRepairImportCandidateArtifactEnvDisabled();
}

export async function fetchGmailRepairWorkerState(
  supabase: SupabaseClient,
  workerId: GmailRepairWorkerId,
): Promise<GmailRepairWorkerStateRow | null> {
  const { data, error } = await supabase
    .from("gmail_repair_worker_state")
    .select("*")
    .eq("id", workerId)
    .maybeSingle();
  if (error) {
    console.warn("[gmailRepairWorkerOps] fetch state", workerId, error.message);
    return null;
  }
  return data as GmailRepairWorkerStateRow | null;
}

type BatchResult =
  | RunGmailInlineHtmlRepairBatchResult
  | RunImportCandidateArtifactInlineHtmlRepairBatchResult;

/** Pure — used by tests and `persistGmailRepairWorkerRunResult`. */
export function gmailRepairLastRunOkFromBatch(
  result: BatchResult,
  lastRunError?: string | null,
): boolean {
  return (
    !lastRunError &&
    result.failed === 0 &&
    !(result.scanned === 0 && (result.failure_samples?.length ?? 0) > 0)
  );
}

/** Pure — maps batch + optional explicit error to a durable `last_run_kind`. */
export function gmailRepairLastRunKindFromBatch(
  result: BatchResult,
  lastRunError?: string | null,
): GmailRepairLastRunKind {
  if (result.scanned === 0 && (result.failure_samples?.length ?? 0) > 0) return "rpc_error";
  if (result.failed > 0) return "partial_failure";
  if (lastRunError) return "partial_failure";
  return "success";
}

/** Bounded operator hints (cron stale, zero migration with backlog). */
export function computeGmailRepairWorkerOpsWarnings(p: {
  backlog_estimate: number | null;
  effective_paused: boolean;
  last_run_at: string | null;
  last_run_kind: string | null;
  last_run_scanned: number | null;
  last_run_migrated: number | null;
  last_run_failed: number | null;
}): string[] {
  const out: string[] = [];
  const backlog = p.backlog_estimate;
  if (backlog != null && backlog > 0 && !p.effective_paused && p.last_run_at) {
    const ageMs = Date.now() - new Date(p.last_run_at).getTime();
    if (ageMs > 70 * 60 * 1000) {
      out.push("Backlog > 0 but durable worker state is older than ~70m; check Inngest cron connectivity.");
    }
  }
  if (
    backlog != null &&
    backlog > 0 &&
    p.last_run_kind === "success" &&
    p.last_run_scanned != null &&
    p.last_run_scanned > 0 &&
    p.last_run_migrated === 0 &&
    (p.last_run_failed ?? 0) === 0
  ) {
    out.push("Last batch scanned rows but migrated 0; rows may be idempotent skips — confirm with logs.");
  }
  return out.slice(0, 3);
}

/** Compact rollup for the Gmail repair ops panel (server-computed). */
export type GmailRepairRunHealth = {
  ok: boolean;
  label: "healthy" | "degraded" | "paused_expected" | "unknown";
};

/**
 * Single boolean + label for operator trust: not a substitute for logs, but a fast green/amber signal.
 * Paused (env or DB) is **healthy** (expected). Backlog RPC failure or warnings or bad last_run_kind → degraded.
 */
export function computeGmailRepairWorkerRunHealth(p: {
  backlog_estimate: number | null;
  effective_paused: boolean;
  last_run_at: string | null;
  last_run_kind: string | null;
  ops_warnings: string[];
  backlog_rpc_error: string | null;
}): GmailRepairRunHealth {
  if (p.backlog_rpc_error) {
    return { ok: false, label: "degraded" };
  }
  if (p.effective_paused) {
    return { ok: true, label: "paused_expected" };
  }
  if (
    p.backlog_estimate != null &&
    p.backlog_estimate > 0 &&
    !p.last_run_at
  ) {
    return { ok: false, label: "degraded" };
  }
  if (!p.last_run_at) {
    return { ok: true, label: "unknown" };
  }
  if (p.ops_warnings.length > 0) {
    return { ok: false, label: "degraded" };
  }
  if (p.last_run_kind === "rpc_error" || p.last_run_kind === "partial_failure") {
    return { ok: false, label: "degraded" };
  }
  return { ok: true, label: "healthy" };
}

/**
 * Persist a cron tick that did no work because the worker is paused (env secret or DB flag).
 * Env pause is checked first in Inngest (same as effective pause).
 */
export async function persistGmailRepairWorkerPauseSkip(
  supabase: SupabaseClient,
  workerId: GmailRepairWorkerId,
  reason: "env" | "db",
): Promise<void> {
  const now = new Date().toISOString();
  const kind: GmailRepairLastRunKind = reason === "env" ? "skipped_env" : "skipped_db";
  const last_run_error = reason === "env" ? "paused:env_secret" : "paused:db_flag";
  const { error } = await supabase
    .from("gmail_repair_worker_state")
    .update({
      last_run_at: now,
      last_run_ok: null,
      last_run_kind: kind,
      last_run_scanned: 0,
      last_run_migrated: 0,
      last_run_failed: 0,
      last_run_skipped_already_ref: 0,
      last_run_skipped_artifact_fk: 0,
      last_run_skipped_no_inline: 0,
      last_run_failure_samples: null,
      last_run_error,
      updated_at: now,
    })
    .eq("id", workerId);
  if (error) {
    console.warn("[gmailRepairWorkerOps] persist pause skip", workerId, error.message);
  }
}

export async function persistGmailRepairWorkerRunResult(
  supabase: SupabaseClient,
  workerId: GmailRepairWorkerId,
  result: BatchResult,
  opts?: { last_run_error?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  const samples = result.failure_samples?.length
    ? result.failure_samples.slice(0, 16)
    : null;
  const last_run_ok = gmailRepairLastRunOkFromBatch(result, opts?.last_run_error);
  const last_run_kind = gmailRepairLastRunKindFromBatch(result, opts?.last_run_error);
  const { error } = await supabase
    .from("gmail_repair_worker_state")
    .update({
      last_run_at: now,
      last_run_ok,
      last_run_kind,
      last_run_scanned: result.scanned,
      last_run_migrated: result.migrated,
      last_run_failed: result.failed,
      last_run_skipped_already_ref: result.skipped_already_ref,
      last_run_skipped_artifact_fk: result.skipped_artifact_fk,
      last_run_skipped_no_inline: result.skipped_no_inline,
      last_run_failure_samples: samples,
      last_run_error: opts?.last_run_error ?? null,
      updated_at: now,
    })
    .eq("id", workerId);
  if (error) {
    console.warn("[gmailRepairWorkerOps] persist run result", workerId, error.message);
  }
}

export async function setGmailRepairWorkerPaused(
  supabase: SupabaseClient,
  workerId: GmailRepairWorkerId,
  paused: boolean,
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("gmail_repair_worker_state")
    .update({
      paused,
      paused_updated_at: now,
      updated_at: now,
    })
    .eq("id", workerId);
  return { error: error?.message ?? null };
}
