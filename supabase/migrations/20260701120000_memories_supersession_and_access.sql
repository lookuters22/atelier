-- Phase 1: memory supersession + last-accessed tracking (additive only).
-- RLS unchanged. Rollback instructions at bottom of file.

ALTER TABLE public.memories
  ADD COLUMN supersedes_memory_id UUID NULL REFERENCES public.memories(id) ON DELETE SET NULL,
  ADD COLUMN last_accessed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.memories.supersedes_memory_id IS
  'When set, this row supersedes the referenced older memory. The older id is excluded from deterministic ranking when a newer header references it.';

COMMENT ON COLUMN public.memories.last_accessed_at IS
  'Updated when this memory is hydrated into promoted context (top selection). Foundation for future decay/hygiene; not a retrieval gate in v1.';

-- Candidate rows that supersede another id (for index-backed lookups if needed later).
CREATE INDEX idx_memories_superseded_source
  ON public.memories (supersedes_memory_id)
  WHERE supersedes_memory_id IS NOT NULL;

-- ROLLBACK (manual):
-- DROP INDEX IF EXISTS public.idx_memories_superseded_source;
-- ALTER TABLE public.memories DROP COLUMN IF EXISTS last_accessed_at;
-- ALTER TABLE public.memories DROP COLUMN IF EXISTS supersedes_memory_id;
