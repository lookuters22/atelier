-- =============================================================
-- Create tasks table for the Tasks Engine
-- =============================================================

CREATE TYPE task_status AS ENUM ('open', 'completed');

CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  wedding_id      UUID REFERENCES weddings(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  due_date        TIMESTAMPTZ NOT NULL,
  status          task_status NOT NULL DEFAULT 'open'
);

ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tasks_photographer ON tasks(photographer_id);
CREATE INDEX idx_tasks_wedding      ON tasks(wedding_id);
CREATE INDEX idx_tasks_due_status   ON tasks(due_date, status);
