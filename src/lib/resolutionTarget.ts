/**
 * Strict discriminated union for Today action destinations — single source for navigation + metadata.
 */

export type PipelineResolutionTab = "timeline" | "tasks" | "thread" | "files" | "financials" | "travel";

/**
 * Exact-resolution metadata for Today actions (pathname + query + explicit ids).
 * `route_to` is always `todayActionHref(resolution)` for a single source of truth.
 */
export type TodayActionResolution = {
  pathname: string;
  searchParams: Record<string, string>;
  weddingId?: string | null;
  threadId?: string | null;
  draftId?: string | null;
  taskId?: string | null;
  escalationId?: string | null;
  pipelineTab?: PipelineResolutionTab;
  inboxAction?: "review_draft";
};

export type ResolutionTarget =
  | { type: "inbox_draft_review"; threadId: string; draftId: string; weddingId: string | null }
  | { type: "inbox_import"; threadId: string }
  | { type: "pipeline_task"; weddingId: string; taskId: string }
  | { type: "orphan_task"; taskId: string }
  | { type: "draft_no_thread"; draftId: string; weddingId: string | null }
  /** wedding + thread: pipeline timeline with thread + escalation context */
  | { type: "pipeline_escalation"; weddingId: string; threadId: string; escalationId: string }
  /** thread without wedding on escalation row: inbox */
  | { type: "inbox_escalation"; threadId: string; escalationId: string }
  /** No thread on escalation — only valid fallback */
  | { type: "today_escalation"; escalationId: string };

export function escalationResolutionTarget(e: {
  id: string;
  wedding_id: string | null;
  thread_id: string | null;
}): ResolutionTarget {
  const tid = e.thread_id?.trim() || null;
  const wid = e.wedding_id?.trim() || null;
  if (wid && tid) {
    return { type: "pipeline_escalation", weddingId: wid, threadId: tid, escalationId: e.id };
  }
  if (tid) {
    return { type: "inbox_escalation", threadId: tid, escalationId: e.id };
  }
  return { type: "today_escalation", escalationId: e.id };
}

export function resolutionTargetToTodayActionResolution(target: ResolutionTarget): TodayActionResolution {
  switch (target.type) {
    case "inbox_draft_review":
      return {
        pathname: "/inbox",
        searchParams: {
          threadId: target.threadId,
          draftId: target.draftId,
          action: "review_draft",
        },
        threadId: target.threadId,
        draftId: target.draftId,
        weddingId: target.weddingId,
        inboxAction: "review_draft",
      };
    case "inbox_import":
      return {
        pathname: "/inbox",
        searchParams: { threadId: target.threadId },
        threadId: target.threadId,
      };
    case "pipeline_task":
      return {
        pathname: `/pipeline/${target.weddingId}`,
        searchParams: { tab: "tasks", openTask: target.taskId },
        weddingId: target.weddingId,
        taskId: target.taskId,
        pipelineTab: "tasks",
      };
    case "orphan_task":
      return {
        pathname: "/tasks",
        searchParams: {},
        taskId: target.taskId,
      };
    case "draft_no_thread":
      return {
        pathname: "/today",
        searchParams: {},
        draftId: target.draftId,
        weddingId: target.weddingId,
      };
    case "pipeline_escalation":
      return {
        pathname: `/pipeline/${target.weddingId}`,
        searchParams: {
          threadId: target.threadId,
          escalationId: target.escalationId,
        },
        weddingId: target.weddingId,
        threadId: target.threadId,
        escalationId: target.escalationId,
        pipelineTab: "timeline" as PipelineResolutionTab,
      };
    case "inbox_escalation":
      return {
        pathname: "/inbox",
        searchParams: {
          threadId: target.threadId,
          escalationId: target.escalationId,
        },
        threadId: target.threadId,
        escalationId: target.escalationId,
      };
    case "today_escalation":
      return {
        pathname: "/today",
        searchParams: { escalationId: target.escalationId },
        escalationId: target.escalationId,
      };
    default: {
      const _x: never = target;
      return _x;
    }
  }
}
