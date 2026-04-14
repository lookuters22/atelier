-- A3: durable queue row for dashboard escalation resolution (was synchronous Edge + LLM + RPC).
-- Service role writes; authenticated photographers can SELECT own rows for progress UI.

CREATE TABLE public.escalation_resolution_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  escalation_id UUID NOT NULL REFERENCES public.escalation_requests(id) ON DELETE CASCADE,
  resolution_summary TEXT NOT NULL,
  photographer_reply_raw TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'failed')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT escalation_resolution_jobs_escalation_unique UNIQUE (escalation_id)
);

CREATE INDEX idx_escalation_resolution_jobs_photographer_escalation
  ON public.escalation_resolution_jobs(photographer_id, escalation_id);

ALTER TABLE public.escalation_resolution_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escalation_resolution_jobs_tenant_select"
  ON public.escalation_resolution_jobs
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

COMMENT ON TABLE public.escalation_resolution_jobs IS
  'Background dashboard escalation resolution jobs (A3 async-first).';
