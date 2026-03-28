import type { TabId } from "./types";

export function WeddingTabs({
  tab,
  setTabAndUrl,
}: {
  tab: TabId;
  setTabAndUrl: (next: TabId) => void;
}) {
  function tabBtn(id: TabId, label: string) {
    const on = tab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTabAndUrl(id)}
        className={
          "rounded-full px-3 py-1 text-[12px] font-semibold transition " +
          (on ? "bg-canvas text-ink" : "text-ink-muted hover:bg-canvas")
        }
      >
        {label}
      </button>
    );
  }

  return (
    <header className="shrink-0 border-b border-border px-6 py-4">
      <div className="flex flex-wrap gap-2">
        {tabBtn("timeline", "Timeline")}
        {tabBtn("thread", "By thread")}
        {tabBtn("tasks", "Tasks")}
        {tabBtn("files", "Files")}
        {tabBtn("financials", "Financials")}
        {tabBtn("travel", "Travel")}
      </div>
    </header>
  );
}
