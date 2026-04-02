import { useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useWeddings } from "../../../hooks/useWeddings";
import { usePipelineMode } from "./PipelineModeContext";
import { usePipelineWedding, PipelineSidebarCards } from "./PipelineWeddingContext";

const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
const ACTIVE_STAGES = new Set(["booked", "prep"]);
const DELIVERABLE_STAGES = new Set(["delivered", "final_balance"]);

export function PipelineInspector() {
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");
  const { weddingId } = usePipelineMode();
  const weddingState = usePipelineWedding();

  const summary = useMemo(() => {
    let inquiries = 0;
    let active = 0;
    let deliverables = 0;
    let archived = 0;
    for (const w of weddings) {
      if (INQUIRY_STAGES.has(w.stage)) inquiries += 1;
      else if (ACTIVE_STAGES.has(w.stage)) active += 1;
      else if (DELIVERABLE_STAGES.has(w.stage)) deliverables += 1;
      else if (w.stage === "archived") archived += 1;
    }
    return { total: weddings.length, inquiries, active, deliverables, archived };
  }, [weddings]);

  if (!weddingId) {
    return (
      <div className="p-4 text-[13px]">
        <h2 className="text-[14px] font-semibold text-foreground">Pipeline Overview</h2>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Total weddings: <span className="font-medium text-foreground">{summary.total}</span>
        </p>
        <ul className="mt-4 space-y-2 text-[12px] text-muted-foreground">
          <li className="flex justify-between gap-2 border-b border-border/80 pb-2">
            <span>Inquiries</span>
            <span className="font-medium tabular-nums text-foreground">{summary.inquiries}</span>
          </li>
          <li className="flex justify-between gap-2 border-b border-border/80 pb-2">
            <span>Active Bookings</span>
            <span className="font-medium tabular-nums text-foreground">{summary.active}</span>
          </li>
          <li className="flex justify-between gap-2 border-b border-border/80 pb-2">
            <span>Deliverables</span>
            <span className="font-medium tabular-nums text-foreground">{summary.deliverables}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>Archived</span>
            <span className="font-medium tabular-nums text-foreground">{summary.archived}</span>
          </li>
        </ul>
      </div>
    );
  }

  if (!weddingState) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <span className="text-[13px] text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <PipelineSidebarCards />
    </div>
  );
}
