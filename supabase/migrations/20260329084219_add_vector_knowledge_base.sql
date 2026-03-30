-- 1. Enable the pgvector extension
create extension if not exists vector;

-- 2. Create the knowledge base table
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid references photographers(id) on delete cascade,
  document_type text not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 3. Create the semantic search function (RPC)
create or replace function match_knowledge (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_photographer_id uuid,
  p_document_type text default null
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.metadata,
    1 - (knowledge_base.embedding <=> query_embedding) as similarity
  from knowledge_base
  where knowledge_base.photographer_id = p_photographer_id
    and (p_document_type is null or knowledge_base.document_type = p_document_type)
    and 1 - (knowledge_base.embedding <=> query_embedding) > match_threshold
  order by knowledge_base.embedding <=> query_embedding
  limit match_count;
$$;
