import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Link2,
  MapPin,
  MessageSquare,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useWeddings } from "../../../hooks/useWeddings";
import { useInboxMode } from "./InboxModeContext";
import { getPipelineMoneyLine } from "../../../data/weddingFinancials";
import { ProjectStoryAndNotes } from "../../shared/ProjectStoryAndNotes";

function formatStageLabel(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function InboxInspector() {
  const { selection } = useInboxMode();

  if (selection.kind === "none") return <IdleState />;
  if (selection.kind === "thread") return <LinkerState />;
  return <CrmState />;
}

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center border-l border-border bg-background px-8 text-center">
      <MessageSquare className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
      <p className="mt-3 max-w-[220px] text-[12px] leading-relaxed text-muted-foreground">
        Select a thread or project to view details.
      </p>
    </div>
  );
}

function LinkerState() {
  const { selection } = useInboxMode();
  const { activeWeddings, linkThread } = useUnfiledInbox();
  const [showLinker, setShowLinker] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  if (selection.kind !== "thread") return null;
  const thread = selection.thread;
  const meta = thread.ai_routing_metadata;

  async function handleLink(weddingId: string) {
    setLinkingId(weddingId);
    await linkThread(thread.id, weddingId);
    setLinkingId(null);
    setShowLinker(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background text-[13px] text-foreground">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Unassigned warning */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} />
            <div>
              <p className="text-[13px] font-medium text-amber-900">
                This thread is unassigned
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-800/80">
                Link it to an existing project or convert it into a new inquiry.
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => alert("Convert to inquiry (demo)")}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#2563eb]/90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Convert to New Inquiry
          </button>
          <button
            type="button"
            onClick={() => setShowLinker(!showLinker)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-[12px] font-semibold text-foreground transition hover:bg-accent"
          >
            <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
            Link to Existing Project
          </button>
        </div>

        {/* Linker dropdown */}
        {showLinker && (
          <div className="rounded-lg border border-border bg-background">
            <div className="px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Select a project
              </p>
            </div>
            {activeWeddings.length === 0 ? (
              <p className="px-3 pb-3 text-[12px] text-muted-foreground">
                No active projects found.
              </p>
            ) : (
              <ul className="max-h-[200px] overflow-y-auto pb-1">
                {activeWeddings.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => handleLink(w.id)}
                      disabled={linkingId !== null}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent/50 disabled:opacity-50"
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/10 text-[9px] font-semibold text-[#2563eb]">
                        {w.couple_names.charAt(0)}
                      </div>
                      <span className="font-medium text-foreground">{w.couple_names}</span>
                      {linkingId === w.id && (
                        <span className="ml-auto text-[11px] text-muted-foreground">Linking…</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Sender info */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sender
          </h3>
          <p className="text-[13px] font-medium text-foreground">
            {thread.sender || "Unknown"}
          </p>
        </div>

        {/* AI suggestion */}
        {meta && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              AI Suggestion
            </h3>
            <div className="space-y-1.5 text-[12px]">
              <p>
                <span className="text-muted-foreground">Intent:</span>{" "}
                {meta.classified_intent}
              </p>
              <p>
                <span className="text-muted-foreground">Confidence:</span>{" "}
                {Math.round(meta.confidence_score * 100)}%
              </p>
              <p className="leading-relaxed text-muted-foreground">{meta.reasoning}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CrmState() {
  const { selection } = useInboxMode();
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");

  if (selection.kind !== "project") return null;

  const wedding = weddings.find((w) => w.id === selection.projectId);

  if (!wedding) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-border bg-background px-8 text-center">
        <p className="text-[12px] text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const moneyLine = getPipelineMoneyLine(wedding.id);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background text-[13px] text-foreground">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Project header */}
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{wedding.couple_names}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize",
              stageBadge(wedding.stage),
            )}>
              {formatStageLabel(wedding.stage)}
            </span>
          </div>
        </div>

        {/* Key details */}
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Event Date</p>
              <p className="mt-0.5 text-[13px] text-foreground">{formatDate(wedding.wedding_date)}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Location</p>
              <p className="mt-0.5 text-[13px] text-foreground">{wedding.location}</p>
            </div>
          </div>

          {moneyLine && (
            <div className="rounded-lg border border-border bg-background px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Financials</p>
              <p className="mt-0.5 text-[13px] text-foreground">{moneyLine}</p>
            </div>
          )}
        </div>

        {/* Open in Pipeline link */}
        <Link
          to={`/pipeline/${wedding.id}`}
          className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/50"
        >
          Open in Pipeline
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        </Link>

        <ProjectStoryAndNotes projectId={wedding.id} />
      </div>
    </div>
  );
}

function stageBadge(stage: string): string {
  const INQUIRY = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
  const ACTIVE = new Set(["booked", "prep"]);
  if (INQUIRY.has(stage)) return "border-amber-200/80 bg-amber-50 text-amber-900";
  if (ACTIVE.has(stage)) return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
  return "border-border bg-muted/60 text-muted-foreground";
}
