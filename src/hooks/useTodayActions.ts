import { useMemo } from "react";
import { buildTodayActionsFromSources, type TodayAction } from "../lib/todayActionFeed";
import { usePendingApprovals } from "./usePendingApprovals";
import { useUnfiledInbox } from "./useUnfiledInbox";
import { useTasks } from "./useTasks";
import { useOpenEscalations } from "./useOpenEscalations";

/**
 * Aggregates drafts, unfiled threads, open tasks, and open escalations into one read model (no storage merge).
 */
export function useTodayActions() {
  const { drafts, isLoading: ld } = usePendingApprovals();
  const { unfiledThreads, isLoading: lu } = useUnfiledInbox();
  const { tasks, isLoading: lt } = useTasks();
  const { escalations, isLoading: le } = useOpenEscalations();

  const allActions = useMemo(
    () =>
      buildTodayActionsFromSources({
        drafts,
        unfiledThreads,
        tasks,
        escalations,
      }),
    [drafts, unfiledThreads, tasks, escalations],
  );

  const byType = useMemo(() => {
    const draftActions = allActions.filter((a) => a.action_type === "draft_approval");
    const unfiledActions = allActions.filter((a) => a.action_type === "unfiled_thread");
    const taskActions = allActions.filter((a) => a.action_type === "open_task");
    const escalationActions = allActions.filter((a) => a.action_type === "open_escalation");
    return { draftActions, unfiledActions, taskActions, escalationActions };
  }, [allActions]);

  return {
    allActions,
    ...byType,
    isLoading: ld || lu || lt || le,
    counts: {
      drafts: drafts.length,
      unfiled: unfiledThreads.length,
      tasks: tasks.length,
      escalations: escalations.length,
    },
  };
}

export type { TodayAction, TodayActionResolution } from "../lib/todayActionFeed";
