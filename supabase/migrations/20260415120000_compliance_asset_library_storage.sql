-- V3 compliance asset library: private tenant-scoped Storage for standard COI / venue packet PDFs.
-- Object keys: {photographer_id}/{filename}.pdf — first path segment must equal auth.uid() for JWT clients.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compliance_asset_library',
  'compliance_asset_library',
  false,
  52428800,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated photographers: read/write/delete only under folder named with their user id.
CREATE POLICY "compliance_asset_library_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'compliance_asset_library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "compliance_asset_library_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'compliance_asset_library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "compliance_asset_library_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'compliance_asset_library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'compliance_asset_library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "compliance_asset_library_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'compliance_asset_library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Note: COMMENT ON POLICY for storage.objects requires owner privileges on hosted Supabase; policy behavior is unchanged.
