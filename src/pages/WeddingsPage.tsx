import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Calendar, MapPin, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { ListPageSkeleton } from "../components/DashboardSkeleton";
import { useWeddings } from "../hooks/useWeddings";
import { useAuth } from "../context/AuthContext";
import { handleGlowMove, handleGlowLeave } from "../lib/glowEffect";
import { MotionPage, MotionSection } from "../components/motion-primitives";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ");
}

export function WeddingsPage() {
  const { photographerId } = useAuth();
  const { data: weddings, isLoading, error, deleteWedding } = useWeddings(photographerId ?? "");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeMenu(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    }
    if (menuOpenId) document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [menuOpenId]);

  if (isLoading) return <ListPageSkeleton />;

  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <MotionPage className="space-y-6">
      <MotionSection className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-display-m text-ink">Weddings</h1>
          <p className="mt-2 max-w-2xl type-small text-ink-muted">
            Every active project in one place. Open a wedding for timeline, threads, tasks, files, and the composer.
          </p>
        </div>
        <Link
          to="/weddings/new"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 type-small font-semibold text-ink transition hover:border-white/[0.12] hover:text-link"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add wedding
        </Link>
      </MotionSection>

      <MotionSection className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {weddings.map((w) => (
          <motion.div
            key={w.id}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="glow-card flex flex-col rounded-lg border border-border bg-surface p-5"
            onMouseMove={handleGlowMove}
            onMouseLeave={handleGlowLeave}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[16px] font-semibold text-ink">{w.couple_names}</p>
                <span className="mt-2 inline-flex rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                  {formatStage(w.stage)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="type-small font-semibold text-ink">{formatCurrency(w.contract_value)}</p>
                <div className="relative" ref={menuOpenId === w.id ? menuRef : undefined}>
                  <button
                    type="button"
                    aria-label="Wedding options"
                    className="rounded-lg p-1.5 text-ink-faint transition hover:bg-canvas hover:text-ink"
                    onClick={() => setMenuOpenId(menuOpenId === w.id ? null : w.id)}
                  >
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  {menuOpenId === w.id && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-surface py-1 shadow-[0_8px_24px_rgba(26,28,30,0.12)]">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 type-small text-red-400 transition hover:bg-canvas"
                        onClick={() => {
                          setMenuOpenId(null);
                          if (window.confirm("Are you sure you want to delete this wedding? All clients, threads, messages, and drafts will be permanently removed.")) {
                            deleteWedding(w.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Delete wedding
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-3 flex items-start gap-2 type-small text-ink-muted">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
              {formatDate(w.wedding_date)}
            </p>
            <p className="mt-2 flex items-start gap-2 type-small text-ink-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
              {w.location}
            </p>
            <p className="mt-3 line-clamp-2 type-small text-ink-muted">{w.story_notes}</p>
            <Link
              to={`/wedding/${w.id}`}
              className="mt-5 inline-flex items-center gap-1.5 self-start type-small font-semibold text-link hover:text-link-hover"
            >
              Open wedding
              <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </motion.div>
        ))}
      </MotionSection>
    </MotionPage>
  );
}
