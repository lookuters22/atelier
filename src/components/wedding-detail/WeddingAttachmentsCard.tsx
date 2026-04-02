import { Paperclip } from "lucide-react";

export function WeddingAttachmentsCard() {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Attachments</p>
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-canvas px-3 py-2">
        <Paperclip className="h-4 w-4 text-ink-faint" />
        <div>
          <p className="text-[13px] font-semibold text-ink">timeline_v3.pdf</p>
          <p className="text-[12px] text-ink-faint">248 KB</p>
        </div>
      </div>
    </div>
  );
}
