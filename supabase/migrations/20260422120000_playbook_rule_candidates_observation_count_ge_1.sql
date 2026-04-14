-- Align `observation_count` with application parser: integers >= 1 only (matches
-- `parseOptionalObservationCount` in `src/lib/operatorResolutionWriteback.ts`).
-- Append-only corrective migration — do not edit `20260421120000_playbook_rule_candidates_learning_loop.sql`.

UPDATE public.playbook_rule_candidates
SET observation_count = 1,
    updated_at = now()
WHERE observation_count < 1;

-- Inline column CHECK from initial migration is named by PostgreSQL:
-- `playbook_rule_candidates_observation_count_check`
ALTER TABLE public.playbook_rule_candidates
  DROP CONSTRAINT IF EXISTS playbook_rule_candidates_observation_count_check;

ALTER TABLE public.playbook_rule_candidates
  ADD CONSTRAINT playbook_rule_candidates_observation_count_check
  CHECK (observation_count >= 1);

COMMENT ON COLUMN public.playbook_rule_candidates.observation_count IS
  'How many times a similar override was observed (future loop); must be >= 1; default 1 on insert.';
