import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useManagerContext } from "../../context/ManagerContext";
import { MANAGER_TASKS } from "../../data/managerPhotographers";

export function ManagerTasksPage() {
  const { selectedId } = useManagerContext();

  const tasks = useMemo(() => {
    if (selectedId === "all") return MANAGER_TASKS;
    return MANAGER_TASKS.filter((t) => t.photographerId === selectedId);
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Tasks</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Pulled from email threads and your own notes—filtered by the selected photographer when not viewing all.
        </p>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-canvas/40 px-6 py-12 text-center text-[14px] text-ink-muted">
          No tasks for this photographer in the demo.
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <div
              key={t.title}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-4"
            >
              <div>
                <p className="text-[14px] font-semibold text-ink">{t.title}</p>
                <p className="mt-1 text-[13px] text-ink-muted">{t.wedding}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="rounded-full bg-border/50 px-3 py-1 text-[12px] font-semibold text-ink-muted">{t.due}</span>
                <Link to={`/manager/wedding/${t.id}`} className="text-[13px] font-semibold text-link hover:text-link-hover">
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
