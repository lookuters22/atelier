import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, PenLine } from "lucide-react";
import { ApprovalDraftAiModal } from "../../components/ApprovalDraftAiModal";
import { useManagerContext } from "../../context/ManagerContext";
import { MANAGER_APPROVAL_DRAFTS, type ManagerApprovalDraft } from "../../data/managerPhotographers";

export function ManagerApprovalsPage() {
  const { selectedId } = useManagerContext();
  const [drafts, setDrafts] = useState<ManagerApprovalDraft[]>(() => [...MANAGER_APPROVAL_DRAFTS]);
  const [editing, setEditing] = useState<ManagerApprovalDraft | null>(null);

  const visible = useMemo(() => {
    if (selectedId === "all") return drafts;
    return drafts.filter((d) => d.photographerId === selectedId);
  }, [drafts, selectedId]);

  function applyBody(id: string, body: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, body } : d)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Approvals</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Nothing reaches a planner or couple until you approve it here or in WhatsApp. Filtered by photographer when applicable.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-canvas/40 px-6 py-12 text-center text-[14px] text-ink-muted">
          No drafts in queue for this filter.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((d) => (
            <div
              key={d.id}
              className="flex flex-col rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{d.wedding}</p>
                  <p className="mt-1 text-[15px] font-semibold text-ink">{d.subject}</p>
                  <p className="mt-1 text-[12px] text-ink-faint">To {d.to}</p>
                </div>
                <Link to={`/manager/wedding/${d.weddingId}`} className="text-[12px] font-semibold text-link hover:text-link-hover">
                  Open context
                </Link>
              </div>
              <p className="mt-4 flex-1 text-[14px] leading-relaxed text-ink-muted">{d.body}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-white/[0.12]"
                >
                  <Check className="h-4 w-4" strokeWidth={1.75} />
                  Approve & send
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(d)}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-ink hover:border-link/30"
                >
                  <PenLine className="h-4 w-4" strokeWidth={1.75} />
                  Edit draft
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ApprovalDraftAiModal
        draft={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onApply={(body) => {
          if (editing) applyBody(editing.id, body);
        }}
      />
    </div>
  );
}
