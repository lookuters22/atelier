import { useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, CalendarClock, ClipboardPen, FlaskConical, Inbox, ListTodo, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTodayMetrics } from "../hooks/useTodayMetrics";
import { useTasks } from "../hooks/useTasks";
import { useUpcomingWeddings } from "../hooks/useUpcomingWeddings";

type AttentionItem = {
  title: string;
  count: number;
  hint: string;
  to: string;
  Icon: LucideIcon;
  iconWell: string;
};

function buildAttention(unfiledCount: number, pendingDraftsCount: number, tasksDueCount: number): AttentionItem[] {
  return [
    {
      title: "Unfiled messages",
      count: unfiledCount,
      hint: "Link threads to the right wedding to keep timelines clean.",
      to: "/inbox?filter=unfiled",
      Icon: Inbox,
      iconWell: "bg-[#e01e5a]/[0.09] text-[#b01238]",
    },
    {
      title: "Drafts awaiting approval",
      count: pendingDraftsCount,
      hint: "Review tone before anything reaches a planner or couple.",
      to: "/approvals",
      Icon: ClipboardPen,
      iconWell: "bg-accent/12 text-accent",
    },
    {
      title: "Tasks due today",
      count: tasksDueCount,
      hint: "Questionnaire reminder for Villa Cetinale.",
      to: "/tasks",
      Icon: ListTodo,
      iconWell: "bg-[#5c6b2e]/10 text-[#4a5a24]",
    },
  ];
}

function formatWeddingDate(iso: string, location: string): string {
  const d = new Date(iso);
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${formatted} \u00B7 ${location}`;
}

function formatStageLabel(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TodayPage() {
  const { photographerId } = useAuth();
  const { unfiledCount, pendingDraftsCount, featuredWedding } = useTodayMetrics();
  const { tasks } = useTasks();
  const { weddings: upcomingWeddings } = useUpcomingWeddings(photographerId ?? "", 4);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function fireTestLead() {
    try {
      setIsSimulating(true);
      setSimResult(null);
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: {
          source: "test_button",
          photographer_id: photographerId,
          lead: {
            name: "Sarah & James",
            email: "sarah.test@example.com",
            event_date: "2026-09-15",
            message:
              "Hi! We are getting married in Lake Como and absolutely love your editorial style. Are you available for our dates?",
          },
        },
      });
      if (error) throw error;
      setSimResult({ ok: true, message: "Lead sent \u2014 check Inbox for the AI pipeline result." });
    } catch (err: unknown) {
      setSimResult({ ok: false, message: err instanceof Error ? err.message : "Failed to send test lead." });
    } finally {
      setIsSimulating(false);
    }
  }

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const tasksDueCount = tasks.filter((t) => new Date(t.due_date) <= endOfToday).length;

  const attention = buildAttention(unfiledCount, pendingDraftsCount, tasksDueCount);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-ink-muted">Wednesday, 25 March</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink md:text-[28px]">
            Good morning, Elena
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-muted">
            Your command center for inquiries, approvals, and what is next in the calendar—without opening your inbox blind.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {featuredWedding ? (
            <Link
              to={`/wedding/${featuredWedding.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink shadow-sm transition hover:border-accent/30 hover:shadow-md"
            >
              <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.75} />
              Open featured wedding
            </Link>
          ) : null}
          <Link
            to="/inbox"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-accent-hover"
          >
            <Inbox className="h-4 w-4" strokeWidth={1.75} />
            Review inbox
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Needs attention</h2>
            <span className="text-[12px] text-ink-faint">Prioritized for today</span>
          </div>
          <div className="grid gap-3">
            {attention.map((item) => (
              <Link
                key={item.title}
                to={item.to}
                className="group flex items-start gap-4 rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(26,28,30,0.04),0_12px_32px_rgba(26,28,30,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(26,28,30,0.06)]"
              >
                <div
                  className={
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + item.iconWell
                  }
                >
                  <item.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                      {item.count}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{item.hint}</p>
                </div>
                <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition group-hover:text-ink" />
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Upcoming weddings</h2>
            <Link to="/calendar" className="text-[12px] font-medium text-accent hover:text-accent-hover">
              View calendar
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-1 shadow-[0_1px_2px_rgba(26,28,30,0.04),0_12px_32px_rgba(26,28,30,0.06)]">
            {upcomingWeddings.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <CalendarClock className="mx-auto h-5 w-5 text-ink-faint" strokeWidth={1.5} />
                <p className="mt-2 text-[13px] text-ink-muted">No upcoming weddings scheduled.</p>
              </div>
            ) : (
              upcomingWeddings.map((w, i) => (
                <Link
                  key={w.id}
                  to={`/wedding/${w.id}`}
                  className={
                    "flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-canvas/80 " +
                    (i < upcomingWeddings.length - 1 ? "border-b border-border/80" : "")
                  }
                >
                  <div>
                    <p className="text-[14px] font-semibold text-ink">{w.couple_names}</p>
                    <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-muted">
                      <CalendarClock className="h-4 w-4 text-ink-faint" strokeWidth={1.5} />
                      {formatWeddingDate(w.wedding_date, w.location)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                      {formatStageLabel(w.stage)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Developer test card */}
      <section className="rounded-2xl border border-dashed border-border bg-surface/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/[0.08] text-accent">
              <FlaskConical className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-ink">Developer Test</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                Fire a simulated inquiry into the live AI pipeline via{" "}
                <span className="font-mono text-[12px] text-ink-faint">webhook-web</span>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fireTestLead}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-sm ring-1 ring-black/[0.04] transition hover:border-accent/35 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSimulating ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-faint/30 border-t-accent" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {isSimulating ? "Sending\u2026" : "Simulate Incoming Lead"}
          </button>
        </div>
        {simResult && (
          <div
            className={
              "mt-3 rounded-lg px-4 py-2 text-[12px] font-medium " +
              (simResult.ok
                ? "border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700"
                : "border border-red-500/20 bg-red-500/[0.06] text-red-600")
            }
          >
            {simResult.message}
          </div>
        )}
      </section>
    </div>
  );
}
