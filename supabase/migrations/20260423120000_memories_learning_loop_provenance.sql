-- Learning loop: provenance on memories for idempotent operator-resolution writeback.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS source_escalation_id UUID NULL
    REFERENCES public.escalation_requests(id) ON DELETE SET NULL;

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS learning_loop_artifact_key TEXT NULL;

COMMENT ON COLUMN public.memories.source_escalation_id IS
  'Escalation that produced this memory (learning-loop atomic resolution).';

COMMENT ON COLUMN public.memories.learning_loop_artifact_key IS
  'Deterministic key per artifact (e.g. memory_0) for idempotent retries.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_learning_loop_idempotency
  ON public.memories (photographer_id, source_escalation_id, learning_loop_artifact_key)
  WHERE source_escalation_id IS NOT NULL
    AND learning_loop_artifact_key IS NOT NULL;
