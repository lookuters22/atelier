import { Link } from "react-router-dom";
import { ListPageSkeleton } from "../components/DashboardSkeleton";
import { useTasks } from "../hooks/useTasks";

function formatDueDate(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay.getTime() === todayStart.getTime()) return "Today";
  if (dueDay.getTime() < todayStart.getTime()) return "Overdue";

  return due.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function TasksPage() {
  const { tasks, isLoading, error, completeTask } = useTasks();

  if (isLoading) {
    return <ListPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13px] text-red-700 dark:text-red-300"
          role="alert"
        >
          <p className="font-medium">Could not load tasks</p>
          <p className="mt-1 font-mono text-[11px] leading-snug break-words">{error}</p>
        </div>
      ) : null}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Tasks</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Pulled from email threads and your own notes—everything dated, everything traceable.
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-ink">All clear</p>
          <p className="mt-1 text-[13px] text-ink-muted">No open tasks right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Complete: ${t.title}`}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-link accent-link focus:ring-link/30"
                  onChange={() => completeTask(t.id)}
                />
                <div>
                  <p className="text-[14px] font-semibold text-ink">{t.title}</p>
                  <p className="mt-1 text-[13px] text-ink-muted">{t.couple_names ?? "General"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="rounded-full bg-border/50 px-3 py-1 text-[12px] font-semibold text-ink-muted">{formatDueDate(t.due_date)}</span>
                {t.wedding_id ? (
                  <Link to={`/wedding/${t.wedding_id}`} className="text-[13px] font-semibold text-link hover:text-link-hover">
                    Open
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
