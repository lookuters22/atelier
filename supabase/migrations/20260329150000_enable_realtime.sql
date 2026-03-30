-- Enable Supabase Realtime on core tables so background AI agent
-- mutations are pushed to the frontend via postgres_changes.
alter publication supabase_realtime add table drafts;
alter publication supabase_realtime add table threads;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table weddings;
