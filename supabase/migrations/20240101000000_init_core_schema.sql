-- =============================================================
-- Atelier OS — Supabase Init Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New Query)
-- =============================================================

-- ── Enums ────────────────────────────────────────────────────
CREATE TYPE project_stage AS ENUM (
  'inquiry',
  'consultation',
  'proposal_sent',
  'contract_out',
  'booked',
  'prep',
  'final_balance',
  'delivered',
  'archived'
);

CREATE TYPE message_direction AS ENUM ('in', 'out', 'internal');

CREATE TYPE thread_kind AS ENUM ('group', 'planner_only', 'other');

CREATE TYPE draft_status AS ENUM ('pending_approval', 'approved', 'rejected');


-- ── 1. photographers (tenants) ──────────────────────────────
CREATE TABLE photographers (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email    TEXT NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE photographers ENABLE ROW LEVEL SECURITY;


-- ── 2. weddings ─────────────────────────────────────────────
CREATE TABLE weddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  couple_names    TEXT NOT NULL,
  wedding_date    TIMESTAMPTZ NOT NULL,
  location        TEXT NOT NULL,
  stage           project_stage NOT NULL DEFAULT 'inquiry',
  package_name    TEXT,
  contract_value  NUMERIC(12, 2),
  balance_due     NUMERIC(12, 2),
  story_notes     TEXT
);

ALTER TABLE weddings ENABLE ROW LEVEL SECURITY;


-- ── 3. clients ──────────────────────────────────────────────
CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  email      TEXT
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;


-- ── 4. threads ──────────────────────────────────────────────
CREATE TABLE threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id       UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  kind             thread_kind NOT NULL DEFAULT 'group',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;


-- ── 5. messages ─────────────────────────────────────────────
CREATE TABLE messages (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  sender    TEXT NOT NULL,
  body      TEXT NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;


-- ── 6. drafts (AI approval queue) ──────────────────────────
CREATE TABLE drafts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  status              draft_status NOT NULL DEFAULT 'pending_approval',
  body                TEXT NOT NULL,
  instruction_history JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;


-- ── RLS Policies ────────────────────────────────────────────
-- Photographers can only see/modify their own row.
CREATE POLICY "photographers_own_row" ON photographers
  FOR ALL USING (id = auth.uid());

-- Every other table: tenant isolation via photographer_id.
-- weddings
CREATE POLICY "weddings_tenant_isolation" ON weddings
  FOR ALL USING (photographer_id = auth.uid());

-- clients (reached through wedding ownership)
CREATE POLICY "clients_tenant_isolation" ON clients
  FOR ALL USING (
    wedding_id IN (SELECT id FROM weddings WHERE photographer_id = auth.uid())
  );

-- threads
CREATE POLICY "threads_tenant_isolation" ON threads
  FOR ALL USING (
    wedding_id IN (SELECT id FROM weddings WHERE photographer_id = auth.uid())
  );

-- messages
CREATE POLICY "messages_tenant_isolation" ON messages
  FOR ALL USING (
    thread_id IN (
      SELECT t.id FROM threads t
      JOIN weddings w ON w.id = t.wedding_id
      WHERE w.photographer_id = auth.uid()
    )
  );

-- drafts
CREATE POLICY "drafts_tenant_isolation" ON drafts
  FOR ALL USING (
    thread_id IN (
      SELECT t.id FROM threads t
      JOIN weddings w ON w.id = t.wedding_id
      WHERE w.photographer_id = auth.uid()
    )
  );


-- ── Indexes for common query patterns ──────────────────────
CREATE INDEX idx_weddings_photographer ON weddings(photographer_id);
CREATE INDEX idx_clients_wedding      ON clients(wedding_id);
CREATE INDEX idx_threads_wedding      ON threads(wedding_id);
CREATE INDEX idx_messages_thread      ON messages(thread_id);
CREATE INDEX idx_drafts_thread        ON drafts(thread_id);
