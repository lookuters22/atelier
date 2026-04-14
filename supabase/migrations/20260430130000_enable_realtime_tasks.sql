-- A8: Include `tasks` in Supabase Realtime so dashboard invalidation can react to task rows (aligns with drafts/threads/messages/weddings).

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
