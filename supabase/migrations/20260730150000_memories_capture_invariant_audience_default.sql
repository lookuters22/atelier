-- Slice 7 (F6/F7): DB-enforce verbal-capture pairing + explicit safe default for audience_source_tier.
-- Additive; follow-up for already-applied 20260723120000 / 20260724120000 migrations.

-- F6: mirror validateOperatorAssistantMemoryPayload — cannot set capture date without channel.
ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS memories_capture_occurred_on_requires_channel;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_capture_occurred_on_requires_channel CHECK (
    capture_occurred_on IS NULL
    OR capture_channel IS NOT NULL
  );

COMMENT ON CONSTRAINT memories_capture_occurred_on_requires_channel ON public.memories IS
  'Verbal/offline capture: capture_occurred_on is allowed only when capture_channel is set (API parity).';

-- F7: new inserts default to client_visible; NULL remains valid for legacy rows (policy treats as client_visible).
ALTER TABLE public.memories
  ALTER COLUMN audience_source_tier SET DEFAULT 'client_visible';

COMMENT ON COLUMN public.memories.audience_source_tier IS
  'When set, limits which reply contexts may load this memory. Default client_visible for new rows; NULL = legacy treat-as-client_visible.';
