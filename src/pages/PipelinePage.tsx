import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ListPageSkeleton } from "../components/DashboardSkeleton";
import { usePipelineWeddings, type PipelineWedding } from "../hooks/usePipelineWeddings";
import { handleGlowMove, handleGlowLeave } from "../lib/glowEffect";
import { MotionPage, MotionSection } from "../components/motion-primitives";

const STAGES = ["Inquiry", "Consultation", "Proposal", "Contract", "Booked", "Prep", "Delivered"] as const;

const STAGE_INDEX_MAP: Record<string, number> = {
  inquiry: 0,
  consultation: 1,
  proposal_sent: 2,
  contract_out: 3,
  booked: 4,
  prep: 5,
  final_balance: 5,
  delivered: 6,
};

type WeddingRow = {
  id: string;
  couple: string;
  when: string;
  city: string;
  value: string;
  currentStageIndex: number;
  waitingOn: string;
  nextAction: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function formatValue(v: number | null): string {
  if (v == null) return "\u2014";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function toWeddingRow(w: PipelineWedding): WeddingRow {
  return {
    id: w.id,
    couple: w.couple_names,
    when: formatDate(w.wedding_date),
    city: w.location,
    value: formatValue(w.contract_value),
    currentStageIndex: STAGE_INDEX_MAP[w.stage] ?? 0,
    waitingOn: "\u2014",
    nextAction: "\u2014",
  };
}

type StageGroup = "action" | "cruise" | "delivered";

function stageGroup(currentStageIndex: number): StageGroup {
  if (currentStageIndex <= 3) return "action";
  if (currentStageIndex <= 5) return "cruise";
  return "delivered";
}

function PipelineCard({ w }: { w: WeddingRow }) {
  const stageLabel = STAGES[w.currentStageIndex];
  const stageNum = w.currentStageIndex + 1;

  return (
    <motion.div whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 400, damping: 25 }} className="glow-card rounded-lg border border-border bg-surface p-5" onMouseMove={handleGlowMove} onMouseLeave={handleGlowLeave}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6 md:items-start">
        <div className="min-w-0">
          <Link to={`/wedding/${w.id}`} className="text-[16px] font-semibold text-ink hover:text-link">
            {w.couple}
          </Link>
          <p className="mt-1 type-small text-ink-muted">
            {w.when} · {w.city}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3 md:items-center md:text-center">
          <span className="inline-flex w-fit max-w-full rounded-lg bg-indigo-500/[0.12] px-2.5 py-1.5 text-[12px] font-semibold leading-tight text-indigo-300 md:mx-auto">
            Stage {stageNum}: {stageLabel}
          </span>
          <div className="flex flex-col gap-1 md:items-center">
            <p className="type-small font-semibold text-ink">{w.value}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-4 border-t border-border/50 pt-4 md:border-t-0 md:pt-0">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Waiting on</p>
            <p className="mt-1.5 type-small leading-snug text-ink">{w.waitingOn}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Next action</p>
            <p className="mt-1.5 type-small leading-snug text-ink">{w.nextAction}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

type SectionKey = "action" | "cruise" | "delivered";

const SECTIONS: { key: SectionKey; title: string; description: string }[] = [
  { key: "action", title: "Action required (Inquiry\u2013Contract)", description: "Pre-booking \u2014 unblock or advance the deal." },
  { key: "cruise", title: "Cruising (Booked & Prep)", description: "Signed clients \u2014 execution and logistics." },
  { key: "delivered", title: "Delivered", description: "Completed journeys." },
];

export function PipelinePage() {
  const { weddings: liveWeddings, isLoading } = usePipelineWeddings();
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    action: true,
    cruise: false,
    delivered: false,
  });

  const rows = useMemo(() => liveWeddings.map(toWeddingRow), [liveWeddings]);

  const grouped = useMemo(() => {
    const action: WeddingRow[] = [];
    const cruise: WeddingRow[] = [];
    const delivered: WeddingRow[] = [];
    for (const w of rows) {
      const g = stageGroup(w.currentStageIndex);
      if (g === "action") action.push(w);
      else if (g === "cruise") cruise.push(w);
      else delivered.push(w);
    }
    return { action, cruise, delivered };
  }, [rows]);

  function rowsFor(key: SectionKey): WeddingRow[] {
    return grouped[key];
  }

  function toggle(key: SectionKey) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (isLoading) {
    return <ListPageSkeleton />;
  }

  return (
    <MotionPage className="space-y-6">
      <MotionSection>
        <h1 className="type-display-m text-ink">Pipeline</h1>
        <p className="mt-2 max-w-2xl type-small text-ink-muted">
          Bottleneck-first triage: see what each couple is waiting on and your next move—grouped so urgent pre-booking work stays on top.
        </p>
      </MotionSection>

      <MotionSection className="space-y-3">
        {SECTIONS.map((section) => {
          const sectionRows = rowsFor(section.key);
          if (sectionRows.length === 0) return null;
          const expanded = open[section.key];
          return (
            <div key={section.key} className="overflow-hidden rounded-lg border border-border bg-canvas/40">
              <button
                type="button"
                onClick={() => toggle(section.key)}
                className="flex w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-white/[0.05] sm:items-center sm:gap-3"
                aria-expanded={expanded}
              >
                <ChevronDown
                  className={"mt-0.5 h-5 w-5 shrink-0 text-ink-faint transition sm:mt-0 " + (expanded ? "" : "-rotate-90")}
                  strokeWidth={2}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="type-small font-semibold text-ink">{section.title}</p>
                  <p className="mt-0.5 type-small text-ink-muted">{section.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-border/50 px-2 py-0.5 text-[12px] font-semibold text-ink-muted">{sectionRows.length}</span>
              </button>
              {expanded ? (
                <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2 sm:px-4">
                  {sectionRows.map((w) => (
                    <PipelineCard key={w.id} w={w} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </MotionSection>
    </MotionPage>
  );
}
