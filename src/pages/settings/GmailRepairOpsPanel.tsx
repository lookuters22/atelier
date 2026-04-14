/**
 * A4: Minimal operator surface for Gmail inline-HTML repair workers (backlog, last run, pause, run-once).
 * Requires Edge secret `GMAIL_REPAIR_OPS_ALLOWED_PHOTOGRAPHER_IDS` and build flag `VITE_GMAIL_REPAIR_OPS_ENABLED`.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type WorkerKey = "messages_inline_html" | "import_candidate_artifact";

type WorkerStatus = {
  backlog_estimate: number | null;
  backlog_rpc_error: string | null;
  db_paused: boolean;
  paused_updated_at: string | null;
  env_disabled: boolean;
  effective_paused: boolean;
  last_run_at: string | null;
  last_run_ok: boolean | null;
  last_run_kind: string | null;
  last_run_scanned: number | null;
  last_run_migrated: number | null;
  last_run_failed: number | null;
  last_run_error: string | null;
  last_run_failure_samples: unknown;
  ops_warnings: string[];
  run_health?: { ok: boolean; label: string };
};

type StatusResponse = {
  ok?: boolean;
  error?: string;
  workers?: {
    messages_inline_html: WorkerStatus;
    import_candidate_artifact: WorkerStatus;
  };
};

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatRunHealthLabel(label: string | undefined): string {
  switch (label) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Needs attention";
    case "paused_expected":
      return "Paused (expected)";
    case "unknown":
      return "No tick yet";
    default:
      return label ?? "—";
  }
}

function formatLastRunKind(kind: string | null | undefined): string {
  switch (kind) {
    case "success":
      return "Success";
    case "skipped_env":
      return "Skipped (env secret)";
    case "skipped_db":
      return "Skipped (DB pause)";
    case "partial_failure":
      return "Partial / failures";
    case "rpc_error":
      return "RPC / scan error";
    default:
      return kind?.length ? kind : "—";
  }
}

export function GmailRepairOpsPanel() {
  const enabled =
    import.meta.env.VITE_GMAIL_REPAIR_OPS_ENABLED === "1" ||
    import.meta.env.VITE_GMAIL_REPAIR_OPS_ENABLED === "true";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState<WorkerKey | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: fnErr } = await supabase.functions.invoke<StatusResponse>("gmail-repair-ops", {
      body: { action: "status" },
    });
    setLoading(false);
    if (fnErr) {
      setError(fnErr.message);
      return;
    }
    if (res?.error) {
      setError(res.error);
      return;
    }
    setData(res ?? null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [enabled, refresh]);

  const setPaused = async (worker: WorkerKey, paused: boolean) => {
    setBusy(worker);
    setError(null);
    const { data: res, error: fnErr } = await supabase.functions.invoke<StatusResponse>("gmail-repair-ops", {
      body: { action: "set_paused", worker, paused },
    });
    setBusy(null);
    if (fnErr) {
      setError(fnErr.message);
      return;
    }
    if (res?.error) {
      setError(res.error);
      return;
    }
    setData(res ?? null);
  };

  const runOnce = async (worker: WorkerKey) => {
    setBusy(worker);
    setError(null);
    const { data: res, error: fnErr } = await supabase.functions.invoke<StatusResponse>("gmail-repair-ops", {
      body: { action: "run_once", worker },
    });
    setBusy(null);
    if (fnErr) {
      setError(fnErr.message);
      return;
    }
    if (res?.error) {
      setError(typeof res.error === "string" ? res.error : JSON.stringify(res.error));
      return;
    }
    setData(res ?? null);
  };

  if (!enabled) return null;

  const wMsg = data?.workers?.messages_inline_html;
  const wCand = data?.workers?.import_candidate_artifact;

  return (
    <div className="mt-4 rounded-lg border border-border border-dashed bg-muted/20 px-3 py-3">
      <p className="text-[12px] font-semibold text-foreground">Gmail HTML repair (ops)</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Legacy inline HTML → Storage artifacts. Backlog counts are live estimates. Env secrets can hard-disable workers
        regardless of pause. Requires server allowlist.
      </p>
      {error ? (
        <p className="mt-2 text-[12px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent/40 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <WorkerCard
          title="Messages (Inbox)"
          w={wMsg}
          busy={busy === "messages_inline_html"}
          onPause={(p) => void setPaused("messages_inline_html", p)}
          onRun={() => void runOnce("messages_inline_html")}
        />
        <WorkerCard
          title="Import candidates (prepared)"
          w={wCand}
          busy={busy === "import_candidate_artifact"}
          onPause={(p) => void setPaused("import_candidate_artifact", p)}
          onRun={() => void runOnce("import_candidate_artifact")}
        />
      </div>
    </div>
  );
}

function WorkerCard(props: {
  title: string;
  w?: WorkerStatus;
  busy: boolean;
  onPause: (paused: boolean) => void;
  onRun: () => void;
}) {
  const { title, w, busy, onPause, onRun } = props;
  const eff = w?.effective_paused ?? false;
  return (
    <div className="rounded-md border border-border bg-background/80 px-2.5 py-2 text-[11px] leading-snug">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-foreground">{title}</p>
        {w?.run_health ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              w.run_health.ok
                ? w.run_health.label === "paused_expected"
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200/90"
                : "bg-amber-500/20 text-amber-950 dark:text-amber-100/90",
            )}
          >
            {formatRunHealthLabel(w.run_health.label)}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-muted-foreground">
        Backlog est.:{" "}
        <span className="font-mono text-foreground">
          {w?.backlog_rpc_error ? `error (${w.backlog_rpc_error.slice(0, 40)}…)` : w?.backlog_estimate ?? "—"}
        </span>
      </p>
      <p className="text-muted-foreground">
        Effective paused: <span className="text-foreground">{eff ? "yes" : "no"}</span>
        {w?.env_disabled ? <span className="text-amber-700 dark:text-amber-300"> (env)</span> : null}
        {w?.db_paused ? <span className="text-muted-foreground"> (DB)</span> : null}
      </p>
      <p className="text-muted-foreground">
        Last tick: {formatTs(w?.last_run_at ?? null)} —{" "}
        <span className="text-foreground">{formatLastRunKind(w?.last_run_kind ?? null)}</span>
        {w?.last_run_ok === true ? (
          <span className="text-emerald-700 dark:text-emerald-300"> · healthy</span>
        ) : w?.last_run_ok === false ? (
          <span className="text-amber-800 dark:text-amber-200/90"> · check errors</span>
        ) : w?.last_run_kind?.includes("skipped") ? (
          <span className="text-muted-foreground"> · no work</span>
        ) : null}
        {w?.last_run_scanned != null && w.last_run_scanned > 0 ? (
          <span className="text-foreground"> · scanned {w.last_run_scanned}</span>
        ) : null}
        {w?.last_run_migrated != null && w.last_run_migrated > 0 ? (
          <span className="text-foreground"> · migrated {w.last_run_migrated}</span>
        ) : null}
        {w?.last_run_failed != null && w.last_run_failed > 0 ? (
          <span className="text-foreground"> · failed {w.last_run_failed}</span>
        ) : null}
      </p>
      {(w?.ops_warnings ?? []).length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-[10px] text-amber-900/90 dark:text-amber-100/85">
          {(w?.ops_warnings ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {w?.last_run_error ? (
        <p className="mt-1 font-mono text-[10px] text-amber-800 dark:text-amber-200/90">{w.last_run_error}</p>
      ) : null}
      {Array.isArray(w?.last_run_failure_samples) && (w?.last_run_failure_samples as unknown[]).length > 0 ? (
        <div className="mt-1 max-h-20 overflow-y-auto rounded border border-border/60 bg-muted/30 px-1.5 py-1">
          <p className="text-[9px] font-medium text-muted-foreground">Failure samples</p>
          <ul className="font-mono text-[9px] leading-tight text-muted-foreground">
            {(w.last_run_failure_samples as unknown[]).slice(0, 6).map((s, i) => (
              <li key={i} className="break-all">
                {String(s)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy || eff}
          onClick={() => onRun()}
          className="rounded border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Run once (batch)
        </button>
        <button
          type="button"
          disabled={busy || w?.env_disabled}
          onClick={() => onPause(!w?.db_paused)}
          className="rounded border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {w?.db_paused ? "Resume (DB)" : "Pause (DB)"}
        </button>
      </div>
    </div>
  );
}
