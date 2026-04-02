import { Shield } from "lucide-react";

export function WeddingLogisticsCard({ onOpenTravel }: { onOpenTravel: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-ink-faint" strokeWidth={1.5} />
        <p className="text-[13px] font-semibold text-ink">Logistics</p>
      </div>
      <p className="mt-2 text-[13px] text-ink-muted">COI on file Â· Travel 11â€“16 Jun Â· Final timeline due 21 May</p>
      <button
        type="button"
        onClick={onOpenTravel}
        className="mt-3 text-[12px] font-semibold text-link hover:text-link-hover"
      >
        Open travel
      </button>
    </div>
  );
}
