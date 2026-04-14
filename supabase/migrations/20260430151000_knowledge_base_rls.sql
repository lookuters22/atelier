-- Slice 1 (production readiness): tenant isolation on knowledge_base.
-- Pattern matches public.memories / playbook_rules (auth.uid() = photographers.id).

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_base_tenant_isolation" ON public.knowledge_base
  FOR ALL
  USING (photographer_id = (select auth.uid()))
  WITH CHECK (photographer_id = (select auth.uid()));

COMMENT ON POLICY "knowledge_base_tenant_isolation" ON public.knowledge_base IS
  'Tenant-scoped access; service_role and postgres bypass RLS for workers.';
