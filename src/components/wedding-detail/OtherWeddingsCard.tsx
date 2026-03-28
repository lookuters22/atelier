import { Link } from "react-router-dom";

export function OtherWeddingsCard() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-canvas/70 p-4 text-[13px] text-ink-muted">
      <p className="font-semibold text-ink">Other weddings</p>
      <p className="mt-2">Jump between projects without losing context.</p>
      <div className="mt-3 flex flex-col gap-2 text-[13px] font-semibold text-accent">
        <Link to="/wedding/santorini" className="hover:text-accent-hover">Amelia & James</Link>
        <Link to="/wedding/london" className="hover:text-accent-hover">Priya & Daniel</Link>
      </div>
    </div>
  );
}
