import { Layers } from "lucide-react";
import { usePipelineMode } from "./PipelineModeContext";
import { usePipelineWedding, PipelineTimelinePane } from "./PipelineWeddingContext";

export function PipelineWorkspace() {
  const { weddingId } = usePipelineMode();
  const weddingState = usePipelineWedding();

  if (!weddingId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Layers className="h-8 w-8 opacity-40" />
        <p className="text-[13px]">Select a wedding from the list</p>
      </div>
    );
  }

  if (!weddingState) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-muted-foreground">Loading wedding...</span>
      </div>
    );
  }

  return <PipelineTimelinePane />;
}
