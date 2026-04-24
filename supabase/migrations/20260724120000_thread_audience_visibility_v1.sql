-- Thread + memory audience visibility v1 (project-type neutral).
-- See docs/v3/REAL_THREADS_ANALYSIS_AND_PROPOSALS.md §6a / IMPLEMENTATION_HANDOVER §6.2.

-- ── threads: default channel is client-visible reply context
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS audience_tier TEXT NOT NULL DEFAULT 'client_visible'
    CHECK (audience_tier IN ('client_visible', 'internal_team', 'operator_only'));

COMMENT ON COLUMN public.threads.audience_tier IS
  'Who may safely see client-facing copy on this thread: client_visible (end client), internal_team (coordinator/planner/vendor circle), operator_only (studio-internal).';

-- ── thread_participants: structured role (free-text visibility_role remains for labels)
ALTER TABLE public.thread_participants
  ADD COLUMN IF NOT EXISTS participant_role TEXT NOT NULL DEFAULT 'other'
    CHECK (participant_role IN (
      'client',
      'coordinator',
      'planner',
      'vendor',
      'operator_internal',
      'other'
    ));

COMMENT ON COLUMN public.thread_participants.participant_role IS
  'Structured participant bucket: client, coordinator, planner, vendor, operator_internal, other. Complements visibility_role text.';

CREATE INDEX IF NOT EXISTS idx_thread_participants_participant_role
  ON public.thread_participants (photographer_id, participant_role);

-- ── memories: optional source tier for retrieval gating on client-facing drafts
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS audience_source_tier TEXT NULL
    CHECK (
      audience_source_tier IS NULL
      OR audience_source_tier IN ('client_visible', 'internal_team', 'operator_only')
    );

COMMENT ON COLUMN public.memories.audience_source_tier IS
  'When set, limits which reply contexts may load this memory; NULL = treat as client_visible (legacy rows).';
