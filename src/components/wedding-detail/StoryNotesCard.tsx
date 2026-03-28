import type { Dispatch, SetStateAction } from "react";

export function StoryNotesCard({
  story,
  summaryBusy,
  regenerateSummary,
  photographerNotes,
  setPhotographerNotes,
}: {
  story: string;
  summaryBusy: boolean;
  regenerateSummary: () => void;
  photographerNotes: string;
  setPhotographerNotes: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Story so far</p>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{story}</p>
      <button
        type="button"
        disabled={summaryBusy}
        className="mt-4 text-[12px] font-semibold text-accent hover:text-accent-hover disabled:opacity-50"
        onClick={regenerateSummary}
      >
        {summaryBusy ? "Regeneratingâ€¦" : "Regenerate summary"}
      </button>
      <div className="mt-5 border-t border-border pt-4">
        <label htmlFor="photographer-wedding-notes" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
          My notes
        </label>
        <textarea
          id="photographer-wedding-notes"
          value={photographerNotes}
          onChange={(e) => setPhotographerNotes(e.target.value)}
          rows={5}
          placeholder="Private notes for your studio â€” not shared with clients."
          className="mt-2 w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/25"
        />
        <p className="mt-1.5 text-[11px] text-ink-faint">Saved automatically in this browser.</p>
      </div>
    </div>
  );
}
