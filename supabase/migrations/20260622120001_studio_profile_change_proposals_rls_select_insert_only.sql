-- Hardening: v1 `FOR ALL` policy allowed clients to UPDATE `review_status` and DELETE rows.
-- Review-first queue: authenticated tenant may only SELECT and INSERT; UPDATE/DELETE are not granted via RLS.
-- (Service role and future server-side review paths are unaffected.)

DROP POLICY IF EXISTS "studio_profile_change_proposals_tenant_isolation" ON public.studio_profile_change_proposals;
DROP POLICY IF EXISTS "studio_profile_change_proposals_tenant_select" ON public.studio_profile_change_proposals;
DROP POLICY IF EXISTS "studio_profile_change_proposals_tenant_insert" ON public.studio_profile_change_proposals;

CREATE POLICY "studio_profile_change_proposals_tenant_select" ON public.studio_profile_change_proposals
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

CREATE POLICY "studio_profile_change_proposals_tenant_insert" ON public.studio_profile_change_proposals
  FOR INSERT
  WITH CHECK (photographer_id = (SELECT auth.uid()));
