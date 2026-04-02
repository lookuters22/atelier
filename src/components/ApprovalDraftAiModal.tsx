import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { ApprovalDraft } from "../data/approvalDrafts";
import { regenerateDraftMock } from "../lib/approvalDraftAi";

type Props = {
  draft: ApprovalDraft | null;
  open: boolean;
  onClose: () => void;
  onApply: (body: string) => void;
};

export function ApprovalDraftAiModal({ draft, open, onClose, onApply }: Props) {
  const [previewBody, setPreviewBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (draft && open) {
      setPreviewBody(draft.body);
      setInstruction("");
    }
  }, [draft, open]);

  if (!open || !draft) return null;

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const next = await regenerateDraftMock(previewBody, instruction);
      setPreviewBody(next);
    } finally {
      setRegenerating(false);
    }
  }

  function handleApply() {
    onApply(previewBody);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/35 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-ai-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id="approval-ai-title" className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
              Refine with AI
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold text-ink">{draft.subject}</p>
            <p className="mt-0.5 text-[12px] text-ink-faint">To {draft.to}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full p-2 text-ink-faint hover:bg-canvas hover:text-ink"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-4 block text-[12px] font-semibold text-ink-muted" htmlFor="approval-ai-instruction">
          How should we change it?
        </label>
        <input
          id="approval-ai-instruction"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Make it sound a bit warmer"
          className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={regenerating}
            onClick={handleRegenerate}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-link/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 text-link" strokeWidth={1.75} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>

        <label className="mt-4 block text-[12px] font-semibold text-ink-muted" htmlFor="approval-ai-preview">
          Draft preview
        </label>
        <textarea
          id="approval-ai-preview"
          value={previewBody}
          onChange={(e) => setPreviewBody(e.target.value)}
          rows={10}
          className="mt-1 w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25"
        />

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full border border-border bg-surface px-5 py-2 text-[13px] font-semibold text-ink hover:border-white/[0.12]"
            onClick={handleApply}
          >
            Apply to queue
          </button>
        </div>
      </div>
    </div>
  );
}
