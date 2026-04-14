-- V3 operator lane (slice 1): silent automation hold on client threads + structured operator turns.

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS v3_operator_automation_hold BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS v3_operator_hold_escalation_id UUID REFERENCES public.escalation_requests(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.threads.v3_operator_automation_hold IS
  'When true, client-thread automation follow-ups (milestones, prep) must not draft; cleared when the linked escalation is resolved from the operator lane.';
COMMENT ON COLUMN public.threads.v3_operator_hold_escalation_id IS
  'Open escalation that caused the hold; used to clear hold only when that row resolves.';

CREATE INDEX IF NOT EXISTS idx_threads_v3_operator_hold_escalation_id
  ON public.threads (v3_operator_hold_escalation_id)
  WHERE v3_operator_hold_escalation_id IS NOT NULL;

CREATE TABLE public.escalation_operator_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  escalation_id UUID NOT NULL REFERENCES public.escalation_requests(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  body TEXT NOT NULL,
  raw_channel TEXT NOT NULL DEFAULT 'whatsapp_operator',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_escalation_operator_turns_escalation_id ON public.escalation_operator_turns(escalation_id);
CREATE INDEX idx_escalation_operator_turns_photographer_id ON public.escalation_operator_turns(photographer_id);

ALTER TABLE public.escalation_operator_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escalation_operator_turns_tenant_isolation" ON public.escalation_operator_turns
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

COMMENT ON TABLE public.escalation_operator_turns IS
  'Append-only operator-lane messages tied to an escalation (WhatsApp in/out, optional system lines).';
