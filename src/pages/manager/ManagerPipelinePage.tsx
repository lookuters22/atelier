import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useManagerContext } from "../../context/ManagerContext";
import { MANAGER_PIPELINE_WEDDINGS } from "../../data/managerPhotographers";
import { handleGlowMove, handleGlowLeave } from "../../lib/glowEffect";
import { MotionPage, MotionSection } from "../../components/motion-primitives";

const STAGES = ["Inquiry", "Consultation", "Proposal", "Contract", "Booked", "Prep", "Delivered"] as const;

function StageTrack({ currentStageIndex }: { currentStageIndex: number }) {
  return (
    <div className="mt-4 w-full min-w-0 overflow-x-auto pb-1 [scrollbar-width:thin]">
      <div className="flex min-w-[640px] items-start sm:min-w-0">
        {STAGES.map((label, i) => {
          const done = i < currentStageIndex;
          const current = i === currentStageIndex;
          const last = i === STAGES.length - 1;

          return (
            <Fragment key={label}>
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <div
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-colors " +
                    (done
                      ? "border-link bg-link text-white"
                      : current
                        ? "border-link bg-surface text-link shadow-[0_0_0_3px_rgba(0,112,243,0.12)]"
                        : "border-border bg-canvas/80 text-ink-faint")
                  }
                  aria-current={current ? "step" : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                </div>
                <span
                  className={
                    "mt-1.5 line-clamp-2 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide sm:text-[10px] " +
                    (current ? "text-ink" : done ? "text-ink-muted" : "text-ink-faint")
                  }
                >
                  {label}
                </span>
              </div>
              {!last ? (
                <div
                  className={
                    "mb-auto mt-3.5 h-0.5 min-w-[6px] flex-1 rounded-full " +
                    (i < currentStageIndex ? "bg-link/70" : "bg-border")
                  }
                  aria-hidden
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function ManagerPipelinePage() {
  const { selectedId } = useManagerContext();

  const weddings = useMemo(() => {
    if (selectedId === "all") return MANAGER_PIPELINE_WEDDINGS;
    return MANAGER_PIPELINE_WEDDINGS.filter((w) => w.photographerId === selectedId);
  }, [selectedId]);

  return (
    <MotionPage className="space-y-6">
      <MotionSection>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Pipeline</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Each wedding has its own journey below—filtered by the photographer switcher when needed.
        </p>
      </MotionSection>

      {weddings.length === 0 ? (
        <MotionSection className="rounded-lg border border-dashed border-border bg-canvas/40 px-6 py-12 text-center text-[14px] text-ink-muted">
          No pipeline rows for this photographer in the demo.
        </MotionSection>
      ) : (
        <MotionSection className="space-y-4">
          {weddings.map((w) => (
            <motion.div
              key={w.id}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="glow-card rounded-lg border border-border bg-surface p-5"
              onMouseMove={handleGlowMove}
              onMouseLeave={handleGlowLeave}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
                <div>
                  <Link
                    to={`/manager/wedding/${w.weddingRouteId}`}
                    className="text-[16px] font-semibold text-ink hover:text-link"
                  >
                    {w.couple}
                  </Link>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    {w.when} · {w.city}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-ink">{w.value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-faint">
                    Now: {STAGES[w.currentStageIndex]}
                  </p>
                </div>
              </div>
              <StageTrack currentStageIndex={w.currentStageIndex} />
            </motion.div>
          ))}
        </MotionSection>
      )}
    </MotionPage>
  );
}
