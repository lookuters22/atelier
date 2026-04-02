import type { Dispatch, SetStateAction } from "react";
import { Paperclip, Sparkles } from "lucide-react";

export function ReplyComposerForm({
  to,
  setTo,
  cc,
  setCc,
  subject,
  setSubject,
  body,
  setBody,
  requestAiDraft,
  closeComposer,
  sendComposer,
  showToast,
}: {
  to: string;
  setTo: Dispatch<SetStateAction<string>>;
  cc: string;
  setCc: Dispatch<SetStateAction<string>>;
  subject: string;
  setSubject: Dispatch<SetStateAction<string>>;
  body: string;
  setBody: Dispatch<SetStateAction<string>>;
  requestAiDraft: () => void;
  closeComposer: () => void;
  sendComposer: () => void;
  showToast: (msg: string) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <label className="block text-[12px] font-semibold text-ink-muted">
        To
        <input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25" />
      </label>
      <label className="block text-[12px] font-semibold text-ink-muted">
        Cc <span className="font-normal text-ink-faint">(optional)</span>
        <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="assistant@studio.com" className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25" />
      </label>
      <label className="block text-[12px] font-semibold text-ink-muted">
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25" />
      </label>
      <label className="block text-[12px] font-semibold text-ink-muted">
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-ink hover:border-white/[0.12]" onClick={requestAiDraft}>
          <Sparkles className="h-4 w-4 text-link" strokeWidth={1.75} />
          Request AI draft
        </button>
        <button type="button" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-ink hover:border-white/[0.12]" onClick={() => showToast("Attachment picker (demo).")}>
          <Paperclip className="h-4 w-4" strokeWidth={1.75} />
          Attach file
        </button>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <button type="button" className="rounded-md px-4 py-2 text-[13px] text-ink-muted hover:text-ink" onClick={closeComposer}>
          Cancel
        </button>
        <button type="button" className="rounded-md border border-border bg-surface px-5 py-2 text-[13px] text-ink hover:border-white/[0.12]" onClick={sendComposer}>
          Submit for approval
        </button>
      </div>
    </div>
  );
}
