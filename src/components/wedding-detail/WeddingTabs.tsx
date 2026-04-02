import { motion } from "framer-motion";
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
          "relative rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors duration-150 " +
          (on
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        {on && (
          <motion.span
            layoutId="wedding-tab-pill"
            className="absolute inset-0 rounded-full dash-glass-active shadow-sm"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <span className="relative z-10">{label}</span>
      </button>
    );
  }

  return (
    <header className="shrink-0 border-b border-border px-6 py-4">
      <div className="dash-glass inline-flex flex-wrap gap-1 rounded-full p-1">
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
