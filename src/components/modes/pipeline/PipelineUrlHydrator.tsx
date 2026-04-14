import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { usePipelineWedding } from "./PipelineWeddingContext";

/**
 * Consumes `?tab=tasks` / `?openTask=<taskId>` from the pipeline wedding URL once project context is ready.
 */
export function PipelineUrlHydrator() {
  const state = usePipelineWedding();
  const [searchParams, setSearchParams] = useSearchParams();
  const processedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;

    const openTask = searchParams.get("openTask");
    const tab = searchParams.get("tab");
    const wantsTasks = tab === "tasks" || Boolean(openTask);
    if (!wantsTasks) {
      processedSignature.current = null;
      return;
    }

    const signature = `${state.weddingId}|${searchParams.toString()}`;
    if (processedSignature.current === signature) return;
    processedSignature.current = signature;

    state.setTabAndUrl("tasks");

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (openTask) {
          document.getElementById(`wedding-task-${openTask}`)?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        }
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("openTask");
            next.delete("tab");
            return next;
          },
          { replace: true },
        );
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [state, searchParams, setSearchParams]);

  return null;
}
