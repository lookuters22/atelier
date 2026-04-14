-- V3 — authorized_case_exceptions: schema-backed, case-scoped policy overrides (execute_v3).
--
-- Purpose: approved tenant operators may record an exception that **deterministically narrows** normal
-- `playbook_rules` behavior for a specific wedding (and optionally a single thread). Merge happens in
-- TypeScript (`deriveEffectivePlaybook`) — not via LLM or freeform `memories.metadata`.
--
-- Truth hierarchy: baseline playbook → **active authorized exceptions** (this table) → ordinary case
-- memory remains supporting-only and does not override policy.
--
-- Tenant isolation: every row includes `photographer_id`; service-role queries must always filter it.

CREATE TABLE public.authorized_case_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  /** When set, exception applies only on this thread; when null, applies to all threads on the wedding. */
  thread_id UUID NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'revoked')),
  /** Stable join key to `playbook_rules.action_key` when `target_playbook_rule_id` is null. */
  overrides_action_key TEXT NOT NULL,
  /** Prefer matching this playbook row id when set (audit + disambiguation). */
  target_playbook_rule_id UUID NULL REFERENCES public.playbook_rules(id) ON DELETE SET NULL,
  /**
   * Structured override only — validated in app code, e.g.:
   * `{ "decision_mode": "draft_only", "instruction_append": "..." }`
   */
  override_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID NULL REFERENCES public.people(id) ON DELETE SET NULL,
  approved_via_escalation_id UUID NULL REFERENCES public.escalation_requests(id) ON DELETE SET NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.authorized_case_exceptions IS
  'Case-scoped authorized policy overrides; deterministic merge with playbook_rules in application code.';

CREATE INDEX idx_authorized_case_exceptions_photographer_wedding
  ON public.authorized_case_exceptions (photographer_id, wedding_id);

CREATE INDEX idx_authorized_case_exceptions_active_window
  ON public.authorized_case_exceptions (photographer_id, wedding_id, status, effective_from DESC);

CREATE INDEX idx_authorized_case_exceptions_action_key
  ON public.authorized_case_exceptions (photographer_id, wedding_id, overrides_action_key)
  WHERE status = 'active';

ALTER TABLE public.authorized_case_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authorized_case_exceptions_tenant_isolation" ON public.authorized_case_exceptions
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));
