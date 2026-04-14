import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { resolveEscalationViaDashboard } from "../../lib/escalationResolutionClient";
import { fireDataChanged } from "../../lib/events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  escalationId: string;
  /** Question preview (optional — loaded from DB when omitted) */
  questionBody?: string;
  actionKey?: string;
  className?: string;
  onResolved?: () => void;
};

/**
 * Resolve an open escalation via the dashboard edge queue (A3). The worker uses the same
 * `resolveOperatorEscalationResolution` handoff as the operator orchestrator.
 */
export function EscalationResolutionPanel({
  escalationId,
  questionBody: questionBodyProp,
  actionKey: actionKeyProp,
  className,
  onResolved,
}: Props) {
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  const [resolutionSummary, setResolutionSummary] = useState("");
  const [photographerReplyRaw, setPhotographerReplyRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [questionBody, setQuestionBody] = useState(questionBodyProp ?? "");
  const [actionKey, setActionKey] = useState(actionKeyProp ?? "");

  useEffect(() => {
    if (questionBodyProp != null) setQuestionBody(questionBodyProp);
  }, [questionBodyProp]);

  useEffect(() => {
    if (actionKeyProp != null) setActionKey(actionKeyProp);
  }, [actionKeyProp]);

  useEffect(() => {
    if (questionBodyProp != null && actionKeyProp != null) return;
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("escalation_requests")
        .select("question_body, action_key")
        .eq("id", escalationId)
        .maybeSingle();
      if (cancelled || qErr || !data) return;
      if (questionBodyProp == null) setQuestionBody(data.question_body ?? "");
      if (actionKeyProp == null) setActionKey(data.action_key ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [escalationId, questionBodyProp, actionKeyProp]);

  /**
   * Restore async resolution state after refresh/navigation (A3).
   * - queued/processing: resume polling (busy).
   * - failed: show stored `last_error`, not busy (user can edit and requeue; edge replaces the row).
   * - Skip if escalation is already answered (avoid stale failed rows).
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: esc } = await supabase
        .from("escalation_requests")
        .select("status")
        .eq("id", escalationId)
        .maybeSingle();
      if (cancelled) return;
      if (esc?.status === "answered") return;

      const { data } = await supabase
        .from("escalation_resolution_jobs")
        .select("id, status, last_error")
        .eq("escalation_id", escalationId)
        .maybeSingle();
      if (cancelled || !data) return;

      const st = String(data.status ?? "").trim().toLowerCase();
      if (st === "queued" || st === "processing") {
        setJobId(data.id);
        setBusy(true);
        return;
      }
      if (st === "failed") {
        setError((data.last_error as string | null) ?? "Resolution failed");
        setJobId(null);
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [escalationId]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const tick = async () => {
      const { data: esc } = await supabase
        .from("escalation_requests")
        .select("status")
        .eq("id", escalationId)
        .maybeSingle();
      if (cancelled) return;

      if (esc?.status === "answered") {
        setJobId(null);
        setBusy(false);
        fireDataChanged("escalations");
        fireDataChanged("inbox");
        onResolvedRef.current?.();
        return;
      }

      const { data: job } = await supabase
        .from("escalation_resolution_jobs")
        .select("status, last_error")
        .eq("id", jobId)
        .maybeSingle();
      if (cancelled) return;

      if (!job) {
        if (esc?.status === "answered") {
          setJobId(null);
          setBusy(false);
          fireDataChanged("escalations");
          fireDataChanged("inbox");
          onResolvedRef.current?.();
        }
        return;
      }

      if (job.status === "failed") {
        setError((job.last_error as string | null) ?? "Resolution failed");
        setJobId(null);
        setBusy(false);
      }
    };

    void tick();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void tick();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jobId, escalationId]);

  async function submit() {
    const summary = resolutionSummary.trim();
    if (!summary) {
      setError("Enter a short resolution summary.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { jobId: qid } = await resolveEscalationViaDashboard({
        escalationId,
        resolutionSummary: summary,
        photographerReplyRaw: photographerReplyRaw.trim() || undefined,
      });
      setJobId(qid);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Resolution failed");
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 text-[13px] text-foreground shadow-sm",
        className,
      )}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Resolve escalation
      </p>
      {questionBody ? (
        <p className="mb-2 leading-snug text-foreground">{questionBody}</p>
      ) : null}
      {actionKey ? (
        <p className="mb-3 text-[12px] text-muted-foreground">
          <span className="text-muted-foreground">Action:</span> {actionKey.replace(/_/g, " ")}
        </p>
      ) : null}
      <label className="mb-2 block">
        <span className="mb-1 block text-[12px] text-muted-foreground">Resolution summary</span>
        <textarea
          className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          value={resolutionSummary}
          onChange={(e) => setResolutionSummary(e.target.value)}
          placeholder="What was decided (one or two sentences)"
          disabled={busy}
        />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] text-muted-foreground">
          Notes / reply for learning (optional)
        </span>
        <textarea
          className="min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          value={photographerReplyRaw}
          onChange={(e) => setPhotographerReplyRaw(e.target.value)}
          placeholder="Optional; defaults to summary if empty"
          disabled={busy}
        />
      </label>
      {jobId ? (
        <p className="mb-2 text-[12px] text-muted-foreground">
          Resolution queued — finishing in the background…
        </p>
      ) : null}
      {error ? <p className="mb-2 text-[12px] text-destructive">{error}</p> : null}
      <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
        {jobId ? "Resolving…" : busy ? "Recording…" : "Record resolution"}
      </Button>
    </div>
  );
}
