-- V3 durable thread workflow state: wire chase, stalled inquiry nudges, cross-channel suppression.
-- Deterministic JSON contract + next_due_at for sweep indexing (no freeform LLM timers).

CREATE TABLE public.v3_thread_workflow_state (
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  wedding_id UUID REFERENCES public.weddings(id) ON DELETE SET NULL,
  workflow JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_due_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (photographer_id, thread_id)
);

CREATE INDEX idx_v3_thread_workflow_state_next_due
  ON public.v3_thread_workflow_state (photographer_id, next_due_at)
  WHERE next_due_at IS NOT NULL;

COMMENT ON TABLE public.v3_thread_workflow_state IS
  'V3 deterministic workflow flags per thread (timeline suppression, wire chase due, stalled nudge due).';

-- Tasks engine: optional thread scope for V3 sweep-created reminders.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_thread ON public.tasks (thread_id) WHERE thread_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.thread_id IS
  'Optional: thread scope when task was created by V3 workflow sweep (e.g. wire chase).';
