-- Slice 2 (production readiness): real pgvector ANN for knowledge_base + proven hot-path btree indexes.
-- Does not change table columns; extends match_knowledge return shape (additive columns).

CREATE EXTENSION IF NOT EXISTS vector;

-- Replace match_knowledge: add document_type + created_at for callers that need full row shape without a second query.
DROP FUNCTION IF EXISTS public.match_knowledge(vector(1536), double precision, integer, uuid, text);

CREATE OR REPLACE FUNCTION public.match_knowledge (
  query_embedding vector(1536),
  match_threshold double precision,
  match_count integer,
  p_photographer_id uuid,
  p_document_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity double precision,
  document_type text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    kb.id,
    kb.content,
    kb.metadata,
    (1 - (kb.embedding <=> query_embedding))::double precision AS similarity,
    kb.document_type,
    kb.created_at
  FROM public.knowledge_base kb
  WHERE kb.photographer_id = p_photographer_id
    AND kb.embedding IS NOT NULL
    AND (p_document_type IS NULL OR kb.document_type = p_document_type)
    AND (1 - (kb.embedding <=> query_embedding)) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_knowledge IS
  'Tenant-scoped cosine similarity over knowledge_base.embedding; returns top match_count rows above match_threshold.';

-- ANN index (cosine distance); partial so NULL embeddings never enter the index.
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_hnsw
  ON public.knowledge_base
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Tenant + type + recency (admin/list paths and non-vector selects).
CREATE INDEX IF NOT EXISTS idx_knowledge_base_photographer_type_created
  ON public.knowledge_base (photographer_id, document_type, created_at DESC);

-- Hot list reads (see useWeddings, useUnfiledInbox, usePendingApprovals, useTasks, Settings import_candidates).
CREATE INDEX IF NOT EXISTS idx_weddings_photographer_wedding_date
  ON public.weddings (photographer_id, wedding_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_threads_photographer_last_activity
  ON public.threads (photographer_id, last_activity_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_drafts_photographer_status_created
  ON public.drafts (photographer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_photographer_status_due
  ON public.tasks (photographer_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_import_candidates_photographer_account_created
  ON public.import_candidates (photographer_id, connected_account_id, created_at DESC);
