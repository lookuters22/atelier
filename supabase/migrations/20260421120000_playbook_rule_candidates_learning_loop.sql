-- Learning loop slice 1 — staged playbook policy patterns (NOT live playbook_rules).
--
-- Truth hierarchy (product):
-- - one-off booking/scope -> authorized_case_exceptions (existing)
-- - interpersonal/context -> memories (existing)
-- - reusable studio pattern -> THIS TABLE only until human approves promotion to playbook_rules
--
-- Candidates are durable and inert for automation: deriveEffectivePlaybook does NOT read this table.

CREATE TABLE public.playbook_rule_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID NULL REFERENCES public.weddings(id) ON DELETE SET NULL,
  thread_id UUID NULL REFERENCES public.threads(id) ON DELETE SET NULL,
  source_escalation_id UUID NULL REFERENCES public.escalation_requests(id) ON DELETE SET NULL,

  proposed_action_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  proposed_instruction TEXT NOT NULL,
  proposed_decision_mode public.decision_mode NOT NULL DEFAULT 'auto'::public.decision_mode,
  proposed_scope public.rule_scope NOT NULL DEFAULT 'global'::public.rule_scope,
  proposed_channel public.thread_channel NULL,

  review_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (review_status IN ('candidate', 'approved', 'rejected', 'superseded')),

  source_classification JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence REAL NULL CHECK (confidence IS NULL OR (confidence >= 0::real AND confidence <= 1::real)),

  operator_resolution_summary TEXT NULL,
  originating_operator_text TEXT NULL,

  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count >= 0),

  superseded_by_id UUID NULL REFERENCES public.playbook_rule_candidates(id) ON DELETE SET NULL,
  promoted_to_playbook_rule_id UUID NULL REFERENCES public.playbook_rules(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.playbook_rule_candidates IS
  'Staged reusable policy patterns; do not merge into effective playbook until explicit human approval + promotion to playbook_rules.';

COMMENT ON COLUMN public.playbook_rule_candidates.source_classification IS
  'Classifier / pipeline labels, model id, lane, etc. — structured, not raw prompts.';

COMMENT ON COLUMN public.playbook_rule_candidates.confidence IS
  'Optional 0–1 confidence from classifier; application may also leave null.';

COMMENT ON COLUMN public.playbook_rule_candidates.operator_resolution_summary IS
  'Bounded digest for audit / UI (full freeform text optional in originating_operator_text).';

COMMENT ON COLUMN public.playbook_rule_candidates.originating_operator_text IS
  'Optional bounded capture of operator freeform resolution for traceability.';

COMMENT ON COLUMN public.playbook_rule_candidates.observation_count IS
  'How many times a similar override was observed (future loop; default 1 on insert).';

COMMENT ON COLUMN public.playbook_rule_candidates.promoted_to_playbook_rule_id IS
  'When review approves and a row is inserted into playbook_rules, link here (promotion is explicit, not automatic in this slice).';

CREATE INDEX idx_playbook_rule_candidates_photographer_review
  ON public.playbook_rule_candidates (photographer_id, review_status);

CREATE INDEX idx_playbook_rule_candidates_source_escalation
  ON public.playbook_rule_candidates (source_escalation_id)
  WHERE source_escalation_id IS NOT NULL;

CREATE INDEX idx_playbook_rule_candidates_photographer_wedding
  ON public.playbook_rule_candidates (photographer_id, wedding_id);

ALTER TABLE public.playbook_rule_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playbook_rule_candidates_tenant_isolation" ON public.playbook_rule_candidates
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));
