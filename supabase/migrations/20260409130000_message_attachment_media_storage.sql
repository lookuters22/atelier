-- Private Storage for `message_attachments` rows (Gmail import + future channels).
-- Object keys: {photographer_id}/{message_id}/... — first segment must equal auth.uid() for JWT clients.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'message_attachment_media',
  'message_attachment_media',
  false,
  26214400
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "message_attachment_media_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'message_attachment_media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "message_attachment_media_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message_attachment_media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "message_attachment_media_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'message_attachment_media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'message_attachment_media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "message_attachment_media_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'message_attachment_media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
