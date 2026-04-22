-- Offer builder: server-backed Puck documents per tenant (Ana-readiness foundation).
-- JSONB holds @measured/puck `Data` — structured for future safe patches.

CREATE TABLE public.studio_offer_builder_projects (
  id UUID PRIMARY KEY,
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  puck_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.studio_offer_builder_projects IS
  'Magazine-style offer layouts (Puck JSON). Tenant-scoped; replaces browser-only persistence for logged-in operators.';

COMMENT ON COLUMN public.studio_offer_builder_projects.puck_data IS
  'Puck editor document (`Data`): root, content[], zones — versioned by app; Ana may read/patch in a future slice.';

CREATE INDEX idx_studio_offer_builder_projects_photographer_updated
  ON public.studio_offer_builder_projects (photographer_id, updated_at DESC);

ALTER TABLE public.studio_offer_builder_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_offer_builder_projects_tenant_isolation"
  ON public.studio_offer_builder_projects
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));
