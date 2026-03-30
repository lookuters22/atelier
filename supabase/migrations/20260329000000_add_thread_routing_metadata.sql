-- =============================================================
-- Allow unfiled threads (nullable wedding_id) and add AI routing metadata
-- =============================================================

ALTER TABLE threads ALTER COLUMN wedding_id DROP NOT NULL;

ALTER TABLE threads ADD COLUMN ai_routing_metadata JSONB DEFAULT NULL;

CREATE INDEX idx_threads_unfiled ON threads(wedding_id) WHERE wedding_id IS NULL;
