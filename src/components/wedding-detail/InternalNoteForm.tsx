import type { Dispatch, SetStateAction } from "react";

export function InternalNoteForm({
  internalBody,
  setInternalBody,
  closeComposer,
  sendComposer,
}: {
  internalBody: string;
  setInternalBody: Dispatch<SetStateAction<string>>;
  closeComposer: () => void;
  sendComposer: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <p className="text-[13px] text-ink-muted">Visible only to your studio â€” never emailed to clients.</p>
      <textarea value={internalBody} onChange={(e) => setInternalBody(e.target.value)} rows={6} placeholder="e.g. Call planner about second shooter add-onâ€¦" className="w-full resize-y rounded-xl border border-blush/50 bg-blush/10 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint" />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-muted" onClick={closeComposer}>
          Cancel
        </button>
        <button type="button" className="rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-canvas" onClick={sendComposer}>
          Save note
        </button>
      </div>
    </div>
  );
}
