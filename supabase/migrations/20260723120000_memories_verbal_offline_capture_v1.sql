-- Verbal / offline capture v1: optional channel + calendar date on operator-confirmed memories.
-- RLS unchanged.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS capture_channel text,
  ADD COLUMN IF NOT EXISTS capture_occurred_on date;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_capture_channel_check CHECK (
    capture_channel IS NULL
    OR capture_channel IN (
      'phone',
      'video_call',
      'in_person',
      'whatsapp',
      'instagram_dm',
      'other'
    )
  );

COMMENT ON COLUMN public.memories.capture_channel IS
  'When set, the off-email channel for this memory (operator verbal/offline capture). Null for normal assistant notes.';

COMMENT ON COLUMN public.memories.capture_occurred_on IS
  'UTC calendar date the operator associates with the capture (YYYY-MM-DD). Requires capture_channel to be set on insert via API.';

-- /*
-- ROLLBACK (manual): run in order if reverting this migration.
--
-- ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_capture_channel_check;
-- ALTER TABLE public.memories DROP COLUMN IF EXISTS capture_occurred_on;
-- ALTER TABLE public.memories DROP COLUMN IF EXISTS capture_channel;
-- */
