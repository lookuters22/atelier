-- Document v1 readiness milestones stored in v3_thread_workflow_state.workflow JSON (no schema change).

COMMENT ON TABLE public.v3_thread_workflow_state IS
  'V3 deterministic workflow per thread: wire chase, stalled nudge, cross-channel timeline, and v1 **readiness** milestones (questionnaire, consultation, timeline, pre_event_briefing) with optional due_at + sweep-created overdue tasks.';
