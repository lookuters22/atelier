import { Link } from "react-router-dom";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarClock, Inbox, Sparkles } from "lucide-react";
import { useManagerContext } from "../../context/ManagerContext";
import { getPhotographerById, MANAGER_ATTENTION, MANAGER_UPCOMING } from "../../data/managerPhotographers";
import { handleGlowMove, handleGlowLeave } from "../../lib/glowEffect";
import { MotionPage, MotionSection } from "../../components/motion-primitives";

const MotionLink = motion.create(Link);

export function ManagerTodayPage() {
  const { selectedId } = useManagerContext();

  const attention = useMemo(() => {
    if (selectedId === "all") return MANAGER_ATTENTION;
    return MANAGER_ATTENTION.filter((a) => a.photographerId === selectedId);
  }, [selectedId]);

  const upcoming = useMemo(() => {
    if (selectedId === "all") return [...MANAGER_UPCOMING];
    return MANAGER_UPCOMING.filter((w) => w.photographerId === selectedId);
  }, [selectedId]);

  return (
    <MotionPage className="space-y-10">
      <MotionSection className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-ink-muted">Wednesday, 25 March</p>
          <h1 className="shiny-heading mt-1 type-display-m">
            Studio overview
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-muted">
            Priorities and calendar across your team—filter with the photographer switcher when you need one lead’s queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MotionLink
            to="/manager/wedding/lake-como"
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-ink transition hover:border-white/[0.12]"
          >
            <Sparkles className="h-4 w-4 text-link" strokeWidth={1.75} />
            Open featured wedding
          </MotionLink>
          <MotionLink
            to="/manager/inbox"
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-ink transition hover:border-white/[0.12]"
          >
            <Inbox className="h-4 w-4" strokeWidth={1.75} />
            Review inbox
          </MotionLink>
        </div>
      </MotionSection>

      <MotionSection className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Needs attention</h2>
            <span className="text-[12px] text-ink-faint">Prioritized for today</span>
          </div>
          {attention.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-canvas/40 px-4 py-8 text-center text-[13px] text-ink-muted">
              Nothing flagged for this photographer right now.
            </p>
          ) : (
            <div className="grid gap-3">
              {attention.map((item) => {
                const ph = getPhotographerById(item.photographerId);
                return (
                  <MotionLink
                    key={item.title + item.photographerId}
                    to={item.to}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="glow-card card-lift group flex items-start gap-4 rounded-lg border border-border bg-surface p-5 transition"
                    onMouseMove={handleGlowMove}
                    onMouseLeave={handleGlowLeave}
                  >
                    <div className="mt-0.5 flex shrink-0 items-center gap-2">
                      {ph ? (
                        <div className={"flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold ring-2 " + ph.ringClass} title={ph.displayName}>
                          {ph.initials}
                        </div>
                      ) : null}
                      <div
                        className="icon-glare flex h-10 w-10 items-center justify-center rounded-[10px] shadow-md"
                        style={{ background: item.iconGradient }}
                      >
                        <item.Icon className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {ph ? (
                          <span className="text-[12px] font-semibold text-ink-muted">{ph.displayName}</span>
                        ) : null}
                        <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                        <span className="rounded-full bg-border/50 px-2 py-0.5 text-[11px] text-ink-muted">
                          {item.count}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{item.hint}</p>
                    </div>
                    <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition group-hover:text-ink" />
                  </MotionLink>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Upcoming weddings</h2>
            <Link to="/manager/calendar" className="text-[12px] text-link hover:text-link-hover">
              View calendar
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-canvas/40 px-4 py-8 text-center text-[13px] text-ink-muted">
              No upcoming weddings for this filter.
            </p>
          ) : (
            <div className="glow-card card-lift rounded-lg border border-border bg-surface p-1.5" onMouseMove={handleGlowMove} onMouseLeave={handleGlowLeave}>
              {upcoming.map((w, i) => {
                const ph = getPhotographerById(w.photographerId);
                return (
                  <Link
                    key={w.id}
                    to={`/manager/wedding/${w.id}`}
                    className={
                      "flex items-center justify-between gap-4 rounded-lg px-4 py-4 transition " +
                      (i < upcoming.length - 1 ? "border-b border-border/80" : "")
                    }
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold text-ink">{w.couple}</p>
                        {ph ? (
                          <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset " + ph.ringClass}>
                            {ph.displayName.split(" ")[0]}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-muted">
                        <CalendarClock className="h-4 w-4 text-ink-faint" strokeWidth={1.5} />
                        {w.when}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] text-ink-muted">
                        {w.stage}
                      </span>
                      <p className="mt-2 text-[12px] text-ink-faint">{w.balance}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </MotionSection>
    </MotionPage>
  );
}
